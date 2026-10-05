import { prisma } from "@/lib/prisma";
import { displayAvatar } from "@/lib/avatar-url";

// Blocking works both ways: once either person blocks the other, neither can find the other in
// search, open their profile, send friend requests, or see, like or comment on their photos.
// Blocking also ends any friendship or pending request between them.

/** Whether either of the two has blocked the other. */
export async function isBlockedEitherWay(a: string, b: string) {
  if (a === b) return false;
  const row = await prisma.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!row;
}

/** Everyone `userId` blocked or was blocked by. */
export async function blockedIds(userId: string) {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
}

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export async function blockUser(userId: string, otherId: string) {
  if (userId === otherId) return { ok: false as const, status: 400, error: "You can't block yourself." };
  const other = await prisma.user.findFirst({ where: { id: otherId, role: "USER" }, select: { id: true } });
  if (!other) return { ok: false as const, status: 404, error: "Planter not found." };
  await prisma.$transaction([
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      create: { blockerId: userId, blockedId: otherId },
      update: {},
    }),
    prisma.friendship.deleteMany({ where: { pairKey: pairKey(userId, otherId) } }),
  ]);
  return { ok: true as const };
}

export async function unblockUser(userId: string, otherId: string) {
  await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: otherId } });
  return { ok: true as const };
}

/** People `userId` has blocked, newest first (Settings → Blocked Users). */
export async function listBlocked(userId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, blocked: { select: { id: true, name: true, image: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    id: r.blocked.id,
    name: r.blocked.name ?? "Anonymous Planter",
    image: displayAvatar(r.blocked),
    blockedAt: r.createdAt.toISOString(),
  }));
}
