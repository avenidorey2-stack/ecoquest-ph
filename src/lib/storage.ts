import path from "node:path";
import { randomUUID } from "node:crypto";
import { blobFolder } from "@/lib/blob-store";

// Proof media storage: Supabase Storage in production, local disk in dev (see blob-store.ts).
// Callers only depend on these function signatures.

const files = blobFolder(
  () => process.env.MEDIA_ROOT ?? path.join(process.cwd(), "storage", "uploads"),
  "uploads",
);
const MB = 1024 * 1024;

export const MEDIA_RULES: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * MB },
  "image/png": { ext: "png", maxBytes: 10 * MB },
  "image/webp": { ext: "webp", maxBytes: 10 * MB },
  "video/mp4": { ext: "mp4", maxBytes: 50 * MB },
  "video/quicktime": { ext: "mov", maxBytes: 50 * MB },
};

const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;

export function mediaUrlForKey(key: string) {
  return `/api/media/${key}`;
}

/** Validates and stores an uploaded file. Throws with a user-facing message on bad input. */
export async function saveMedia(file: File) {
  const rule = MEDIA_RULES[file.type];
  if (!rule) throw new Error("Upload a JPG, PNG, WebP, MP4 or MOV file.");
  if (file.size > rule.maxBytes) {
    throw new Error(`File is too large (max ${rule.maxBytes / MB} MB).`);
  }

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
