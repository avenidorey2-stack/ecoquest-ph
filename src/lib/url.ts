import { headers } from "next/headers";

/**
 * Only allows same-site relative paths as post-login destinations (prevents open redirects
 * like ?callbackUrl=https://evil.example or //evil.example).
 */
export function safeCallbackUrl(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}

/** Public origin for links built in a route handler. Prefers AUTH_URL (set it in production). */
export function originFromRequest(req: Request) {
  return process.env.AUTH_URL ? new URL(process.env.AUTH_URL).origin : new URL(req.url).origin;
}

/** Public origin for absolute links (e.g. invite URLs). Prefers AUTH_URL, else the request host. */
export async function getAppOrigin() {
  if (process.env.AUTH_URL) return new URL(process.env.AUTH_URL).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
