import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { avatarUrlForKey, isAvatarKey, keyFromAvatarUrl } from "@/lib/avatar-url";

export { avatarUrlForKey, displayAvatar, keyFromAvatarUrl } from "@/lib/avatar-url";

// Profile pictures. Uploads are re-encoded to a 256×256 WebP: that normalises size, drops
// EXIF metadata (phone photos can carry GPS coordinates), and neutralises anything that
// merely pretends to be an image. Stored outside `public/` because Next.js only serves
// public files that existed at build time; served by /api/avatars/[key] instead.

const ROOT = process.env.AVATAR_ROOT ?? path.join(process.cwd(), "storage", "avatars");
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 256;

function filePath(key: string) {
  // Runtime data, not source — keep Turbopack from tracing it into the server bundle.
  return path.join(/* turbopackIgnore: true */ ROOT, key);
}

/** JPEG, PNG or WebP by magic bytes — the declared Content-Type can't be trusted. */
export function sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export class AvatarError extends Error {}

/** Validates, re-encodes and stores an uploaded picture. Returns its public URL. */
export async function saveAvatar(file: File) {
  if (file.size === 0) throw new AvatarError("Choose an image to upload.");
  if (file.size > MAX_AVATAR_BYTES) throw new AvatarError("Image is too large (max 5 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffImageType(bytes)) throw new AvatarError("Upload a JPG, PNG or WebP image.");

  let webp: Buffer;
  try {
    webp = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate() // honour EXIF orientation before metadata is dropped
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AvatarError("That image couldn't be read. Try a different file.");
  }

  const key = `${randomUUID()}.webp`;
  await mkdir(ROOT, { recursive: true });
  await writeFile(filePath(key), webp);
  return { key, url: avatarUrlForKey(key) };
}

export async function readAvatar(key: string) {
  if (!isAvatarKey(key)) return null;
  try {
    return await readFile(filePath(key));
  } catch {
    return null;
  }
}

export async function deleteAvatar(url: string | null | undefined) {
  const key = keyFromAvatarUrl(url);
  if (key) await unlink(filePath(key)).catch(() => {});
}

