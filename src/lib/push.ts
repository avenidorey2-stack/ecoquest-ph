import webpush from "web-push";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

// Phone / browser notifications (Web Push). A planter turns them on in Settings (or from the
// Chats prompt); the browser gives a subscription we keep per device. New messages and in-app
// notifications are then also pushed to every device they turned it on for. Works on Android,
// computers, and iPhones with EcoQuest added to the Home Screen (iOS 16.4+).
// Needs VAPID keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (+ optional VAPID_SUBJECT).
// Without them (local dev, tests) nothing is pushed.

export type PushPayload = {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url: string;
  /** Same tag replaces the earlier notification (e.g. one per chat) instead of stacking. */
  tag?: string;
};

/** Pushes still open longer than this are dropped by the push service. */
const TTL_SECONDS = 24 * 60 * 60;
const MAX_TEXT = 180;

let configured: boolean | null = null;
function ready() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  configured = !!(publicKey && privateKey);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:stsclimatechange2h@gmail.com", publicKey!, privateKey!);
  return configured;
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/** Saves this device's subscription for the user (moving it over if another account had it). */
export async function savePushSubscription(userId: string, input: unknown) {
  const sub = (input ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint } = sub;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1000) return fail(400, "Invalid subscription.");
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return fail(400, "Invalid subscription.");
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  });
  return { ok: true as const };
}

/** Forgets a device (the planter turned notifications off there, or signed out). */
export async function removePushSubscription(userId: string, endpoint: unknown) {
  if (typeof endpoint !== "string") return fail(400, "Invalid subscription.");
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return { ok: true as const };
}

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text);

/** Sends now to every device of these users; dead subscriptions (unsubscribed, expired) are removed. */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!ready() || !userIds.length) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const data = JSON.stringify({ ...payload, title: clip(payload.title), body: clip(payload.body) });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: TTL_SECONDS, urgency: "high" });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("Push failed:", status ?? err);
      }
    }),
  );
  return sent;
}

/**
 * Pushes after the response is sent (and so after the change that caused it is saved), so
 * pushing never slows down or fails the request. Outside a request it sends in the background.
 */
export function queuePush(userIds: string | string[], payload: PushPayload) {
  if (!ready()) return;
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const run = () => sendPush(ids, payload).catch((err) => console.error("Push failed:", err));
  try {
    after(run);
  } catch {
    void run();
  }
}
