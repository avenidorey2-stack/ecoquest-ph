import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { blobFolder } from "@/lib/blob-store";
import { MEDIA_RULES, mediaRuleError } from "@/lib/media-rules";

// Proof media storage: Supabase Storage in production, local disk in dev (see blob-store.ts).
// Callers only depend on these function signatures.

const files = blobFolder(
  () => process.env.MEDIA_ROOT ?? path.join(process.cwd(), "storage", "uploads"),
  "uploads",
);
const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;
/** How long a signed media download link stays valid. */
const DOWNLOAD_URL_SECONDS = 60 * 60;

export type StoredMedia = { key: string; url: string; type: string };

export function mediaUrlForKey(key: string) {
  return `/api/media/${key}`;
}

/** Validates and stores an uploaded file. Throws with a user-facing message on bad input. */
export async function saveMedia(file: File): Promise<StoredMedia> {
  const problem = mediaRuleError(file);
  if (problem) throw new Error(problem);

  const rule = MEDIA_RULES[file.type];
  const key = `${randomUUID()}.${rule.ext}`;
  await files.put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return { key, url: mediaUrlForKey(key), type: file.type };
}

export async function readMedia(key: string) {
  if (!KEY_PATTERN.test(key)) return null;
  return files.get(key);
}

export async function deleteMedia(key: string) {
  if (!KEY_PATTERN.test(key)) return;
  await files.remove(key);
}

// ─── Direct uploads (browser → Supabase Storage) ────────────────────────────
// Vercel caps request bodies at 4.5 MB, so with Supabase the browser uploads the file
// straight to storage through a signed URL, then submits only the file's key. The key comes
// with an HMAC token tying it to the quest, so nobody can submit someone else's file
// (approved proof URLs are visible to every signed-in user).

function uploadToken(questId: string, key: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`proof-upload:${questId}:${key}`).digest("base64url");
}

export function isValidUploadToken(questId: string, key: string, token: string) {
  const expected = Buffer.from(uploadToken(questId, key));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Starts a direct upload for a file of an allowed `type` (already checked by the caller).
 * Returns null when files are on local disk: the browser then posts the file to our API.
 */
export async function createDirectUpload(questId: string, type: string) {
  const key = `${randomUUID()}.${MEDIA_RULES[type].ext}`;
  const url = await files.signedUploadUrl(key);
  return url ? { url, key, token: uploadToken(questId, key) } : null;
}

/**
 * Checks a directly uploaded file against the media rules, using what storage actually
 * holds (not what the browser claimed). Bad files are deleted.
 */
export async function verifyDirectUpload(key: string): Promise<{ media: StoredMedia } | { error: string }> {
  if (!KEY_PATTERN.test(key)) return { error: "Invalid upload. Please try again." };
  const stat = await files.stat(key);
  if (!stat) return { error: "Your upload didn't arrive. Please try again." };

  const problem =
    stat.size === 0
      ? "The uploaded file is empty. Please try again."
      : (mediaRuleError(stat) ??
        // The key's extension was picked from the declared type; it must match what arrived.
        (MEDIA_RULES[stat.type].ext === key.split(".").pop() ? null : "Upload a JPG, PNG, WebP, MP4 or MOV file."));
  if (problem) {
    await files.remove(key);
    return { error: problem };
  }
  return { media: { key, url: mediaUrlForKey(key), type: stat.type } };
}

/** Short-lived direct link to a stored file (Supabase), or null to serve it ourselves. */
export function mediaDownloadUrl(key: string) {
  if (!KEY_PATTERN.test(key)) return Promise.resolve(null);
  return files.signedDownloadUrl(key, DOWNLOAD_URL_SECONDS);
}
