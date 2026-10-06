// Browser-side upload helpers: proof submissions and chat attachments.

export type DirectUpload = { url: string; key: string; token: string };
export type Result = { status: number; data: { error?: string; upload?: DirectUpload | null } & Record<string, unknown> };

export const succeeded = (r: Result) => r.status >= 200 && r.status < 300;
export const TOO_BIG = "This file is too big to upload. Try a shorter video or a smaller photo.";

/** Sends with XHR (fetch can't report upload progress). Rejects only on network failure. */
export function sendWithProgress(
  method: "POST" | "PUT",
  url: string,
  body: XMLHttpRequestBodyInit,
  onProgress: (pct: number) => void,
  headers: Record<string, string> = {},
) {
  return new Promise<Result>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error page (e.g. the host rejecting an oversized request).
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Network Error"));
    xhr.send(body);
  });
}

export async function postJson(url: string, body: unknown): Promise<Result> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/**
 * Sends a chat message with an optional photo/video. With Supabase the file goes straight to
 * storage through a signed URL from `uploadUrl`, then the message carries only its key; on local
 * disk the file is posted with the message. Resolves to the response data, or `{ error }`.
 */
export async function sendChatMessage(
  { sendUrl, uploadUrl }: { sendUrl: string; uploadUrl: string },
  body: string,
  file: File | null,
  onProgress: (pct: number) => void,
): Promise<Result["data"]> {
  const fail = (r: Result, fallback: string) => ({ error: r.status === 413 ? TOO_BIG : (r.data.error ?? fallback) });
  if (!file) {
    const res = await postJson(sendUrl, { body });
    return succeeded(res) ? res.data : fail(res, "Couldn't send your message. Please try again.");
  }

  const start = await postJson(uploadUrl, { type: file.type, size: file.size });
  if (!succeeded(start)) return fail(start, "Couldn't start the upload. Please try again.");
  const upload = start.data.upload;
  if (upload) {
    const put = await sendWithProgress("PUT", upload.url, file, onProgress, { "Content-Type": file.type });
    if (!succeeded(put)) return put.status === 413 ? { error: TOO_BIG } : { error: "Upload to storage failed. Please try again." };
    const res = await postJson(sendUrl, { body, key: upload.key, token: upload.token });
    return succeeded(res) ? res.data : fail(res, "Couldn't send your message. Please try again.");
  }

  const form = new FormData();
  form.set("body", body);
  form.set("file", file);
  const res = await sendWithProgress("POST", sendUrl, form, onProgress);
  return succeeded(res) ? res.data : fail(res, "Couldn't send your message. Please try again.");
}
