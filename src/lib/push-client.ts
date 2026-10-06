// Browser side of phone/browser notifications (see lib/push.ts): registers the service worker
// (public/sw.js), asks permission, and sends this device's subscription to the server.

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const SW_URL = "/sw.js";
/** False when the site has no push keys set up: then notification controls stay hidden. */
export const PUSH_CONFIGURED = !!PUBLIC_KEY;

export type PushState =
  /** This browser can't do push, or the site isn't set up for it. */
  | "unsupported"
  /** iPhone/iPad in Safari: push only works after "Add to Home Screen". */
  | "ios-install"
  /** The planter blocked notifications for this site in the browser. */
  | "denied"
  | "off"
  | "on";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const registration = () => navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });

async function save(sub: PushSubscription) {
  const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
  if (!res.ok) throw new Error("save");
}

/** What the notifications switch should show on this device. */
export async function pushState(): Promise<PushState> {
  if (!PUBLIC_KEY) return "unsupported";
  if (!supported()) return typeof window !== "undefined" && isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

/** Asks permission (must run from a tap) and subscribes this device. Resolves to the new state. */
export async function enablePush(): Promise<PushState> {
  if (!PUBLIC_KEY || !supported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
  await save(sub);
  return "on";
}

/** Stops notifications on this device. */
export async function disablePush(): Promise<PushState> {
  if (!supported()) return pushState();
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return "off";
}

/**
 * On app start: if this device already has notifications on, make sure the server has its
 * current subscription (browsers rotate them, and a sign-in may be a different account).
 */
export async function syncPushSubscription() {
  if (!PUBLIC_KEY || !supported() || Notification.permission !== "granted") return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) await save(sub);
  } catch {
    // Next start tries again.
  }
}
