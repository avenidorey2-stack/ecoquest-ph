import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Local-disk media storage for development. Swap these three functions for
// S3 / R2 / Vercel Blob in production — callers only depend on the signatures.

const ROOT = process.env.MEDIA_ROOT ?? path.join(process.cwd(), "storage", "uploads");
const MB = 1024 * 1024;

export const MEDIA_RULES: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * MB },
  "image/png": { ext: "png", maxBytes: 10 * MB },
  "image/webp": { ext: "webp", maxBytes: 10 * MB },
  "video/mp4": { ext: "mp4", maxBytes: 50 * MB },
  "video/quicktime": { ext: "mov", maxBytes: 50 * MB },
};

const KEY_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;

/**
 * Absolute path for a stored file. Uploads are runtime data (MEDIA_ROOT can point anywhere),
 * not source, so tell Turbopack not to trace this path into the server bundle.
 */
function filePath(key: string) {
  return path.join(/* turbopackIgnore: true */ ROOT, key);
}

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
  await mkdir(ROOT, { recursive: true });
  await writeFile(filePath(key), Buffer.from(await file.arrayBuffer()));
  return { key, url: mediaUrlForKey(key), type: file.type };
}

export async function readMedia(key: string) {
  if (!KEY_PATTERN.test(key)) return null;
  try {
    return await readFile(filePath(key));
  } catch {
    return null;
  }
}

export async function deleteMedia(key: string) {
  if (!KEY_PATTERN.test(key)) return;
  await unlink(filePath(key)).catch(() => {});
}
