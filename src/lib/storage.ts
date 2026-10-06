import path from "node:path";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { blobFolder } from "@/lib/blob-store";
import { MEDIA_RULES, mediaRuleError } from "@/lib/media-rules";

// Uploaded photo/video storage: Supabase Storage in production, local disk in dev (see
// blob-store.ts). Callers only depend on these function signatures.

const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;
/** How long a signed media download link stays valid. */
const DOWNLOAD_URL_SECONDS = 60 * 60;

export type StoredMedia = { key: string; url: string; type: string };

/**
 * A store of user-uploaded photos/videos checked against the media rules: proof media, and chat
 * attachments (messages and problem reports). `urlBase` is the API route that serves a key after
 * its own access checks; `purpose` keeps upload tokens of one store from working in another.
 */
function mediaStore(dir: () => string, prefix: string, urlBase: string, purpose: string) {
  const files = blobFolder(dir, prefix);
  const urlFor = (key: string) => `${urlBase}/${key}`;

  // ─── Direct uploads (browser → Supabase Storage) ──────────────────────────
  // Vercel caps request bodies at 4.5 MB, so with Supabase the browser uploads the file
  // straight to storage through a signed URL, then submits only the file's key. The key comes
  // with an HMAC token tying it to a `scope` (the quest, or the chat and sender), so nobody can
  // submit someone else's file.
  function uploadToken(scope: string, key: string) {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is not set");
    return createHmac("sha256", secret).update(`${purpose}:${scope}:${key}`).digest("base64url");
  }

  return {
    urlFor,

    /** Validates and stores an uploaded file. Throws with a user-facing message on bad input. */
    async save(file: File): Promise<StoredMedia> {
      const problem = mediaRuleError(file);
      if (problem) throw new Error(problem);
      const rule = MEDIA_RULES[file.type];
      const key = `${randomUUID()}.${rule.ext}`;
      await files.put(key, new Uint8Array(await file.arrayBuffer()), file.type);
      return { key, url: urlFor(key), type: file.type };
    },

    read(key: string) {
      if (!KEY_PATTERN.test(key)) return Promise.resolve(null);
      return files.get(key);
    },

    async remove(key: string) {
      if (!KEY_PATTERN.test(key)) return;
      await files.remove(key);
    },

    isValidToken(scope: string, key: string, token: string) {
      const expected = Buffer.from(uploadToken(scope, key));
      const given = Buffer.from(token);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },

    /**
     * Starts a direct upload for a file of an allowed `type` (already checked by the caller).
     * Returns null when files are on local disk: the browser then posts the file to our API.
     */
    async createUpload(scope: string, type: string) {
      const key = `${randomUUID()}.${MEDIA_RULES[type].ext}`;
      const url = await files.signedUploadUrl(key);
      return url ? { url, key, token: uploadToken(scope, key) } : null;
    },

    /**
     * Checks a directly uploaded file against the media rules, using what storage actually
     * holds (not what the browser claimed). Bad files are deleted.
     */
    async verifyUpload(key: string): Promise<{ media: StoredMedia } | { error: string }> {
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
      return { media: { key, url: urlFor(key), type: stat.type } };
    },

    /** Short-lived direct link to a stored file (Supabase), or null to serve it ourselves. */
    downloadUrl(key: string) {
      if (!KEY_PATTERN.test(key)) return Promise.resolve(null);
      return files.signedDownloadUrl(key, DOWNLOAD_URL_SECONDS);
    },
  };
}

const mediaRoot = () => process.env.MEDIA_ROOT ?? path.join(process.cwd(), "storage", "uploads");

/** Planting proof (served by /api/media/<key>). */
const proofs = mediaStore(mediaRoot, "uploads", "/api/media", "proof-upload");

/** Photos and videos sent in messages and problem reports (served by /api/chat-media/<key>). */
export const chatMedia = mediaStore(() => path.join(mediaRoot(), "chat"), "chat", "/api/chat-media", "chat-upload");

export const mediaUrlForKey = proofs.urlFor;
export const saveMedia = proofs.save;
export const readMedia = proofs.read;
export const deleteMedia = proofs.remove;
export const isValidUploadToken = proofs.isValidToken;
export const createDirectUpload = proofs.createUpload;
export const verifyDirectUpload = proofs.verifyUpload;
export const mediaDownloadUrl = proofs.downloadUrl;
