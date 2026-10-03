import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Where uploaded files live. With SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set (production),
// files go to a private Supabase Storage bucket; otherwise to local disk (dev and tests).
// The bucket is private: files are only ever served through our own API routes, which keep
// doing the access checks.

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "ecoquest";

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { base: `${url.replace(/\/$/, "")}/storage/v1`, key } : null;
}

function headers(key: string, extra?: Record<string, string>) {
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

let bucketReady: Promise<void> | null = null;

/** Creates the private bucket on first use (an "already exists" answer is fine). */
function ensureBucket(sb: { base: string; key: string }) {
  bucketReady ??= fetch(`${sb.base}/bucket`, {
    method: "POST",
    headers: headers(sb.key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  }).then(async (res) => {
    if (res.ok) return;
    const text = await res.text();
    if (!/already exists|Duplicate/i.test(text)) {
      bucketReady = null;
      throw new Error(`Storage bucket setup failed (${res.status}): ${text}`);
    }
  });
  return bucketReady;
}

/** A folder of stored files: `dir` is the local directory, `prefix` the bucket folder. */
export function blobFolder(dir: () => string, prefix: string) {
  // Runtime data, not source — keep Turbopack from tracing it into the server bundle.
  const filePath = (key: string) => path.join(/* turbopackIgnore: true */ dir(), key);
  const objectUrl = (base: string, key: string) => `${base}/object/${BUCKET}/${prefix}/${key}`;

  return {
    /**
     * Supabase only: a one-time URL the browser can PUT the file to (valid ~2 hours), so large
     * uploads skip our server and its request-size limit. Returns null on local disk.
     */
    async signedUploadUrl(key: string): Promise<string | null> {
      const sb = supabase();
      if (!sb) return null;
      await ensureBucket(sb);
      const res = await fetch(`${sb.base}/object/upload/sign/${BUCKET}/${prefix}/${key}`, {
        method: "POST",
        headers: headers(sb.key, { "Content-Type": "application/json" }),
        body: "{}",
      });
      if (!res.ok) throw new Error(`Storage upload signing failed (${res.status}): ${await res.text()}`);
      const { url } = (await res.json()) as { url?: string };
      if (!url?.includes("token=")) throw new Error("Storage upload signing returned no token");
      return `${sb.base}${url}`;
    },

    /** Size and content type of a stored file, or null if it doesn't exist. */
    async stat(key: string): Promise<{ size: number; type: string } | null> {
      const sb = supabase();
      if (!sb) return null; // only needed for direct uploads, which are Supabase-only
      const res = await fetch(`${sb.base}/object/info/${BUCKET}/${prefix}/${key}`, {
        headers: headers(sb.key),
        cache: "no-store",
      });
      // Supabase answers a missing object with 400 or 404.
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage lookup failed (${res.status}): ${await res.text()}`);
      const info = (await res.json()) as {
        size?: number;
        content_type?: string;
        metadata?: { size?: number; mimetype?: string };
      };
      const size = info.size ?? info.metadata?.size;
      const type = info.content_type ?? info.metadata?.mimetype;
      if (typeof size !== "number" || typeof type !== "string") throw new Error("Storage lookup returned no size/type");
      return { size, type };
    },

    /** Supabase only: a short-lived download URL, so big files stream from storage, not our server. */
    async signedDownloadUrl(key: string, expiresInSeconds: number): Promise<string | null> {
      const sb = supabase();
      if (!sb) return null;
      const res = await fetch(`${sb.base}/object/sign/${BUCKET}/${prefix}/${key}`, {
        method: "POST",
        headers: headers(sb.key, { "Content-Type": "application/json" }),
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });
      if (!res.ok) return null;
      const { signedURL } = (await res.json()) as { signedURL?: string };
      return signedURL ? `${sb.base}${signedURL}` : null;
    },

    async put(key: string, data: Uint8Array, contentType: string) {
      const sb = supabase();
      if (!sb) {
        await mkdir(dir(), { recursive: true });
        await writeFile(filePath(key), data);
        return;
      }
      await ensureBucket(sb);
      const res = await fetch(objectUrl(sb.base, key), {
        method: "POST",
        headers: headers(sb.key, { "Content-Type": contentType, "x-upsert": "false" }),
        body: Buffer.from(data),
      });
      if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
    },

    async get(key: string): Promise<Buffer | null> {
      const sb = supabase();
      if (!sb) return readFile(filePath(key)).catch(() => null);
      const res = await fetch(objectUrl(sb.base, key), { headers: headers(sb.key), cache: "no-store" });
      return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    },

    async remove(key: string) {
      const sb = supabase();
      if (!sb) {
        await unlink(filePath(key)).catch(() => {});
        return;
      }
      await fetch(`${sb.base}/object/${BUCKET}`, {
        method: "DELETE",
        headers: headers(sb.key, { "Content-Type": "application/json" }),
        body: JSON.stringify({ prefixes: [`${prefix}/${key}`] }),
      }).catch(() => {});
    },
  };
}
