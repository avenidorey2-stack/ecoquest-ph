import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Notifications shown in the header bell dropdown. */
export const NOTIFICATION_LIST_SIZE = 20;

/** Creates one in-app notification. `link` must be an in-app path (e.g. "/rewards"). */
export function notify(db: Db, userId: string, message: string, link?: string) {
  return db.notification.create({ data: { userId, message, link: safeLink(link) } });
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

/** Only same-site paths are stored, so a notification can never link off-site. */
function safeLink(link: string | undefined) {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}
