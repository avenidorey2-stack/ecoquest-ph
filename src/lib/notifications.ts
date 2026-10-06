import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { queuePush } from "@/lib/push";

type Db = PrismaClient | Prisma.TransactionClient;

/** Notifications shown in the header bell dropdown. */
export const NOTIFICATION_LIST_SIZE = 20;

/**
 * Creates one in-app notification. `link` must be an in-app path (e.g. "/rewards"). It's also
 * pushed to the user's phone/browser if they turned that on (sent after the request finishes).
 */
export function notify(db: Db, userId: string, message: string, link?: string) {
  const safe = safeLink(link);
  queuePush(userId, { title: "EcoQuest PH", body: message, url: safe ?? "/dashboard" });
  return db.notification.create({ data: { userId, message, link: safe } });
}

/** Notifies every user whose home city is `cityCode` (e.g. a new planting slot there). */
export async function notifyCity(db: Db, cityCode: string, message: string, link?: string) {
  const users = await db.user.findMany({ where: { cityCode }, select: { id: true } });
  if (!users.length) return 0;
  const { count } = await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, message, link: safeLink(link) })),
  });
  return count;
}

/** Notifies every admin (e.g. a new proof to review), except `exceptUserId` — an admin acting themselves. */
export async function notifyAdmins(db: Db, message: string, link?: string, exceptUserId?: string) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  if (!admins.length) return 0;
  const { count } = await db.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, message, link: safeLink(link) })),
  });
  queuePush(admins.map((a) => a.id), { title: "EcoQuest PH Admin", body: message, url: safeLink(link) ?? "/admin" });
  return count;
}

/** Dashboard link that scrolls to the map, zooms to the slot and opens its popup. */
export function slotOnMapPath(slotId: string) {
  return `/dashboard?slot=${encodeURIComponent(slotId)}`;
}

/** Only same-site paths are stored, so a notification can never link off-site. */
function safeLink(link: string | undefined) {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
