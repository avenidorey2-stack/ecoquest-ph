import { chatMedia, type StoredMedia } from "@/lib/storage";
import { mediaRuleError } from "@/lib/media-rules";
import { hitRateLimit } from "@/lib/rate-limit";

// Photos and videos sent in chats (messages between friends, and problem reports). Same rules
// and upload flow as planting proof: production uploads go straight to Supabase Storage through
// a signed URL and only the key is sent; on local disk the file is posted with the message.

/** Each signed URL lets the browser store up to 50 MB: cap how many one account can request. */
const UPLOADS_PER_HOUR = 60;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/** Text of a chat message, trimmed. It may be empty only when a photo or video goes with it. */
export function messageText(input: unknown, hasMedia: boolean, max: number): string | Fail {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text && !hasMedia) return fail(400, "Write a message or attach a photo or video.");
  if (text.length > max) return fail(400, `Keep the message under ${max.toLocaleString("en-PH")} characters.`);
  return text;
}

/**
 * Starts a direct upload of a `{ type, size }` file for `scope` (the chat and sender). Returns
 * `upload: null` on local disk, where the browser posts the file with the message instead.
 */
export async function startChatUpload(userId: string, scope: string, input: unknown) {
  const { type, size } = (input ?? {}) as { type?: unknown; size?: unknown };
  if (typeof type !== "string" || !Number.isInteger(size) || (size as number) <= 0) return fail(400, "Choose a photo or video.");
  const problem = mediaRuleError({ type, size: size as number });
  if (problem) return fail(400, problem);
  if (!(await hitRateLimit(`chat-upload:${userId}`, UPLOADS_PER_HOUR, 60 * 60 * 1000))) {
    return fail(429, "Too many uploads. Please try again in an hour.");
  }
  try {
    return { ok: true as const, upload: await chatMedia.createUpload(scope, type) };
  } catch (err) {
    console.error("Chat upload signing failed:", err);
    return fail(502, "Couldn't start the upload. Please try again.");
  }
}

/**
 * Reads a send request: JSON `{ body, key?, token?, replyTo? }` (the file is already in storage)
 * or a multipart form with `body`, `replyTo` and an optional `file` (local disk), which is stored
 * here. The caller removes `media` if the message then isn't saved.
 */
export async function readChatSend(req: Request, scope: string): Promise<{ ok: true; body: unknown; replyTo: unknown; media: StoredMedia | null } | Fail> {
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "Invalid request.");
    const file = form.get("file");
    const fields = { body: form.get("body"), replyTo: form.get("replyTo") };
    if (!(file instanceof File) || file.size === 0) return { ok: true, ...fields, media: null };
    try {
      return { ok: true, ...fields, media: await chatMedia.save(file) };
    } catch (err) {
      return fail(400, (err as Error).message);
    }
  }

  const json = (await req.json().catch(() => null)) as { body?: unknown; key?: unknown; token?: unknown; replyTo?: unknown } | null;
  if (!json || typeof json !== "object") return fail(400, "Invalid request.");
  if (json.key === undefined || json.key === null) return { ok: true, body: json.body, replyTo: json.replyTo, media: null };
  if (typeof json.key !== "string" || typeof json.token !== "string" || !chatMedia.isValidToken(scope, json.key, json.token)) {
    return fail(400, "Upload expired or invalid. Please try again.");
  }
  const checked = await chatMedia.verifyUpload(json.key).catch((err) => {
    console.error("Chat upload check failed:", err);
    return null;
  });
  if (!checked) return fail(502, "Couldn't check your upload. Please try again.");
  if ("error" in checked) return fail(400, checked.error);
  return { ok: true, body: json.body, replyTo: json.replyTo, media: checked.media };
}

/**
 * Saves a message that comes with `media` (just stored). If it isn't saved, the file is removed —
 * unless another message already uses it (the same upload sent twice).
 */
export async function saveWithMedia<T extends { ok: boolean }>(media: StoredMedia | null, save: () => Promise<T>): Promise<T | Fail> {
  try {
    const result = await save();
    if (!result.ok && media) await chatMedia.remove(media.key).catch(() => {});
    return result;
  } catch (err) {
    if (media && (err as { code?: string })?.code === "P2002") return fail(409, "This upload was already sent. Please attach the file again.");
    if (media) await chatMedia.remove(media.key).catch(() => {});
    throw err;
  }
}
