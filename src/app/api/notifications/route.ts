import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_LIST_SIZE } from "@/lib/notifications";
import { remindExpiringClaims } from "@/lib/quests";

// GET /api/notifications — the signed-in user's recent notifications and unread count.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // "Less than a day left" claim reminders are created as the app checks for notifications.
  await remindExpiringClaims(user.id);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIST_SIZE,
      select: { id: true, message: true, link: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications — mark all of the user's notifications as read.
export async function PATCH() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  return NextResponse.json({ marked: count });
}
