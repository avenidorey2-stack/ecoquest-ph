// Browser-only: makes phone camera files uploadable before the media rules check them.
// Some Android cameras and browsers label a JPEG "image/jpg" or nothing at all, hand over HEIC
// photos, or save MP4 videos as "video/3gpp". The file's first bytes say what it really is.

import { fileWithType, MEDIA_RULES } from "@/lib/media-rules";

/** Longest side of a photo that has to be re-encoded (plenty for a chat or a proof photo). */
const MAX_PHOTO_PX = 2560;
const JPEG_QUALITY = 0.85;

const HEIF_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif", "avis"]);

/** What the file's bytes say it is: an allowed type, "image" (a photo we must convert), or null. */
export function sniffMediaType(head: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (HEIF_BRANDS.has(brand)) return "image";
    // QuickTime, else an MP4-family container (mp4, isom, 3gp4/3gp5 and friends).
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}

function relabel(file: File, type: string) {
  const ext = MEDIA_RULES[type]?.ext;
  const name = ext ? `${file.name.replace(/\.[^.]*$/, "") || "camera"}.${ext}` : file.name;
  return new File([file], name, { type, lastModified: file.lastModified });
}

/** Re-encodes a photo the browser can decode as a JPEG, scaled down to MAX_PHOTO_PX. */
async function toJpeg(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_PHOTO_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    return blob ? relabel(new File([blob], file.name, { lastModified: file.lastModified }), "image/jpeg") : null;
  } catch {
    return null; // the browser can't decode it (e.g. HEIC on most Android browsers)
  }
}

/**
 * The file as the app can upload it: labelled with its real type, and photos the rules would
 * refuse (HEIC, unlabelled, over the size limit) converted to JPEG when the browser can.
 * Returns the original file when nothing helps, so the rules check gives the usual message.
 */
export async function prepareMedia(raw: File): Promise<File> {
  const file = fileWithType(raw);
  let sniffed: string | null = null;
  try {
    sniffed = sniffMediaType(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  } catch {
    // unreadable: fall through with the declared type
  }
  const type = sniffed && sniffed !== "image" ? sniffed : file.type;
  const labelled = MEDIA_RULES[type] && type !== file.type ? relabel(file, type) : file;

  const rule = MEDIA_RULES[labelled.type];
  const isPhoto = sniffed === "image" || labelled.type.startsWith("image/");
  if (isPhoto && (!rule || labelled.size > rule.maxBytes)) return (await toJpeg(labelled)) ?? labelled;
  return labelled;
}
