// Photo/video rules (planting proof and chat attachments), plus voice messages (chats only),
// shared by the upload forms (instant feedback) and the server (enforcement).
// Client-safe: no Node imports here.

export const MB = 1024 * 1024;

export const MEDIA_RULES: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 10 * MB },
  "image/png": { ext: "png", maxBytes: 10 * MB },
  "image/webp": { ext: "webp", maxBytes: 10 * MB },
  "video/mp4": { ext: "mp4", maxBytes: 50 * MB },
  "video/quicktime": { ext: "mov", maxBytes: 50 * MB },
};

/** Voice messages as phones and browsers record them: AAC in MP4 (iPhone, newer Chrome), Opus in WebM or Ogg. */
export const VOICE_RULES: Record<string, { ext: string; maxBytes: number }> = {
  "audio/mp4": { ext: "m4a", maxBytes: 10 * MB },
  "audio/webm": { ext: "weba", maxBytes: 10 * MB },
  "audio/ogg": { ext: "ogg", maxBytes: 10 * MB },
};

/** What chats accept: photos, videos and voice messages. */
export const CHAT_MEDIA_RULES = { ...MEDIA_RULES, ...VOICE_RULES };

/** "audio/webm;codecs=opus" → "audio/webm": recorders add codec details the rules don't list. */
export const baseType = (type: string) => type.split(";")[0].trim().toLowerCase();

/** How a stored file is shown and named: "photo", "video" or "voice". */
export function mediaKind(type: string): "photo" | "video" | "voice" {
  return type.startsWith("audio/") ? "voice" : type.startsWith("video/") ? "video" : "photo";
}

/** "Photo", "Video" or "Voice Message", for previews. */
export const mediaLabel = (type: string) => ({ photo: "Photo", video: "Video", voice: "Voice Message" })[mediaKind(type)];

/**
 * User-facing reason the file can't be used, or null if it's fine. `rules` is MEDIA_RULES (proof,
 * photo/video pickers) or CHAT_MEDIA_RULES (chat uploads, which may also be voice messages).
 */
export function mediaRuleError(file: { type: string; size: number }, rules: Record<string, { ext: string; maxBytes: number }> = MEDIA_RULES): string | null {
  const rule = rules[file.type];
  if (!rule && /hei[cf]/.test(file.type)) {
    return "This phone saved the photo as HEIC, which this browser can't open. Set the camera to JPEG (\"Most Compatible\") or choose the photo from your gallery.";
  }
  if (!rule && file.type.startsWith("audio/") && rules === MEDIA_RULES) return "Voice messages can only be sent in chats.";
  if (!rule && file.type.startsWith("audio/")) return "This voice recording format isn't supported. Try another browser.";
  if (!rule) return "Upload a JPG, PNG, WebP, MP4 or MOV file.";
  if (file.size > rule.maxBytes) return `File is too large (max ${rule.maxBytes / MB} MB).`;
  return null;
}

// Some Android file managers hand over files without a MIME type: infer it from the extension.
const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

export function fileWithType(file: File) {
  if (file.type) return file;
  const type = EXT_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""];
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

export function formatSize(bytes: number) {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
