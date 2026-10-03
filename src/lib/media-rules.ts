// Proof media rules, shared by the upload form (instant feedback) and the server (enforcement).
// Client-safe: no Node imports here.

export const MB = 1024 * 1024;

export const MEDIA_RULES: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * MB },
  "image/png": { ext: "png", maxBytes: 10 * MB },
  "image/webp": { ext: "webp", maxBytes: 10 * MB },
  "video/mp4": { ext: "mp4", maxBytes: 50 * MB },
  "video/quicktime": { ext: "mov", maxBytes: 50 * MB },
};

/** The `accept` attribute for proof file inputs. */
export const MEDIA_ACCEPT = Object.keys(MEDIA_RULES).join(",");

/** User-facing reason the file can't be used, or null if it's fine. */
export function mediaRuleError(file: { type: string; size: number }): string | null {
  const rule = MEDIA_RULES[file.type];
  if (!rule) return "Upload a JPG, PNG, WebP, MP4 or MOV file.";
  if (file.size > rule.maxBytes) return `File is too large (max ${rule.maxBytes / MB} MB).`;
  return null;
}
