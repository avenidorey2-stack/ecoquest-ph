import type { PhotoVisibility } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { visiblePresence } from "@/lib/active-status";
import { notify } from "@/lib/notifications";
import { displayAvatar } from "@/lib/avatar-url";
import { levelForXp } from "@/lib/levels";
import { blockedIds, isBlockedEitherWay } from "@/lib/blocks";

/** The friendship row's key for a pair of users, whichever of them asked first. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** How `otherId` relates to `viewerId`. */
export type FriendState = "SELF" | "NONE" | "REQUESTED" | "INCOMING" | "FRIENDS";

export async function friendState(viewerId: string, otherId: string): Promise<FriendState> {
  if (viewerId === otherId) return "SELF";
  const row = await prisma.friendship.findUnique({ where: { pairKey: pairKey(viewerId, otherId) } });
  return stateOf(row, viewerId);
}

function stateOf(row: { status: string; requesterId: string } | null, viewerId: string): FriendState {
  if (!row) return "NONE";
  if (row.status === "ACCEPTED") return "FRIENDS";
  return row.requesterId === viewerId ? "REQUESTED" : "INCOMING";
}

export async function areFriends(a: string, b: string) {
  if (a === b) return false;
  const row = await prisma.friendship.findUnique({ where: { pairKey: pairKey(a, b) }, select: { status: true } });
  return row?.status === "ACCEPTED";
}

/** Planters who can be found and befriended: regular users only (admins and patrons aren't listed). */
async function findPlanter(id: string) {
  return prisma.user.findFirst({ where: { id, role: "USER" }, select: { id: true, name: true, notifyFriendRequests: true } });
}

type Result = { ok: true; state: FriendState } | { ok: false; status: number; error: string };

/**
 * Sends a friend request — or accepts theirs, if `otherId` already asked `userId`. Repeating a
 * request (or befriending a friend) is a no-op.
 */
export async function requestFriend(userId: string, otherId: string): Promise<Result> {
  if (userId === otherId) return { ok: false, status: 400, error: "You can't add yourself." };
  const other = await findPlanter(otherId);
  if (!other || (await isBlockedEitherWay(userId, otherId))) return { ok: false, status: 404, error: "Planter not found." };

  const key = pairKey(userId, otherId);
  const existing = await prisma.friendship.findUnique({ where: { pairKey: key } });
  if (existing) {
    if (existing.status === "PENDING" && existing.addresseeId === userId) return acceptFriend(userId, otherId);
    return { ok: true, state: stateOf(existing, userId) };
  }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.friendship.create({ data: { pairKey: key, requesterId: userId, addresseeId: otherId } });
      if (other.notifyFriendRequests) await notify(tx, otherId, `${me?.name ?? "A planter"} sent you a friend request.`, "/friends");
    });
  } catch (e) {
    // Both asked at the same moment: the other request won the unique pair key — accept it.
    if ((e as { code?: string }).code === "P2002") return requestFriend(userId, otherId);
    throw e;
  }
  return { ok: true, state: "REQUESTED" };
}

/** Accepts `otherId`'s pending request to `userId`. */
export async function acceptFriend(userId: string, otherId: string): Promise<Result> {
  const key = pairKey(userId, otherId);
  const [me, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: otherId }, select: { notifyFriendRequests: true } }),
  ]);
  const accepted = await prisma.$transaction(async (tx) => {
    const { count } = await tx.friendship.updateMany({
      where: { pairKey: key, status: "PENDING", addresseeId: userId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    if (count && other?.notifyFriendRequests) {
      await notify(tx, otherId, `${me?.name ?? "A planter"} accepted your friend request.`, `/planters/${userId}`);
    }
    return count > 0;
  });
  if (!accepted) return { ok: false, status: 404, error: "No friend request to accept." };
  return { ok: true, state: "FRIENDS" };
}

/** Cancels a sent request, declines a received one, or unfriends — whatever is between the two. */
export async function removeFriend(userId: string, otherId: string): Promise<Result> {
  await prisma.friendship.deleteMany({ where: { pairKey: pairKey(userId, otherId) } });
  return { ok: true, state: "NONE" };
}

// ─── Lists & search ─────────────────────────────────────────────────────────

export type PlanterCard = {
  id: string;
  name: string;
  image: string | null;
  city: string | null;
  province: string | null;
  level: number;
  state: FriendState;
  /** Last active (friends only, if they share it): "Active Now" / "Active 2m ago". */
  activeAt: string | null;
  online: boolean;
};

const cardSelect = {
  id: true,
  name: true,
  image: true,
  avatarUrl: true,
  city: true,
  province: true,
  xp: true,
  lastActiveAt: true,
  isOnline: true,
  showActiveStatus: true,
} as const;
type CardUser = {
  id: string;
  name: string | null;
  image: string | null;
  avatarUrl: string | null;
  city: string | null;
  province: string | null;
  xp: number;
  lastActiveAt: Date | null;
  isOnline: boolean;
  showActiveStatus: boolean;
};

function toCard(u: CardUser, state: FriendState): PlanterCard {
  return {
    id: u.id,
    name: u.name ?? "Anonymous Planter",
    image: displayAvatar(u),
    city: u.city,
    province: u.province,
    level: levelForXp(u.xp),
    state,
    ...visiblePresence(u, state === "FRIENDS"),
  };
}

/** Friends, received requests and sent requests, newest first. */
export async function listFriends(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: cardSelect }, addressee: { select: cardSelect } },
  });
  const friends: PlanterCard[] = [];
  const incoming: PlanterCard[] = [];
  const outgoing: PlanterCard[] = [];
  for (const row of rows) {
    const other = row.requesterId === userId ? row.addressee : row.requester;
    const state = stateOf(row, userId);
    (state === "FRIENDS" ? friends : state === "INCOMING" ? incoming : outgoing).push(toCard(other, state));
  }
  friends.sort((a, b) => a.name.localeCompare(b.name));
  return { friends, incoming, outgoing };
}

export async function countIncomingRequests(userId: string) {
  return prisma.friendship.count({ where: { addresseeId: userId, status: "PENDING" } });
}

export const SEARCH_MIN = 2;
const SEARCH_LIMIT = 20;
/** Matches fetched before ranking, so a name that starts with the query isn't cut by a busier "contains" match. */
const SEARCH_POOL = 100;

/**
 * How well `name` matches `q`, ignoring case: 0 = the whole name, 1 = the name starts with it,
 * 2 = a later word starts with it ("Ma. Gabby" for "gab"), 3 = somewhere inside a word.
 */
export function nameMatchRank(name: string, q: string) {
  const n = name.toLocaleLowerCase();
  const k = q.trim().toLocaleLowerCase();
  if (n === k) return 0;
  if (n.startsWith(k)) return 1;
  if (n.split(/[\s.\-']+/).some((word) => word.startsWith(k))) return 2;
  return 3;
}

/**
 * Planters whose name contains `query`, in any mix of upper and lower case ("gab" finds Gab, GAB,
 * Gabriel and Ma. Gabby), each with the viewer's friend state. Best name matches first, then the
 * busiest planters.
 */
export async function searchPlanters(viewerId: string, query: string): Promise<PlanterCard[]> {
  const q = query.trim().slice(0, 60);
  if (q.length < SEARCH_MIN) return [];
  const hidden = await blockedIds(viewerId);
  const pool = await prisma.user.findMany({
    // Banned planters drop out of search.
    where: { role: "USER", bannedAt: null, id: { notIn: [viewerId, ...hidden] }, name: { contains: q, mode: "insensitive" } },
    orderBy: [{ totalPlants: "desc" }, { name: "asc" }],
    take: SEARCH_POOL,
    select: cardSelect,
  });
  // A stable sort keeps the busiest-first order within each rank.
  const users = pool
    .map((u) => ({ u, rank: nameMatchRank(u.name ?? "", q) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SEARCH_LIMIT)
    .map(({ u }) => u);
  if (!users.length) return [];
  const rows = await prisma.friendship.findMany({
    where: { pairKey: { in: users.map((u) => pairKey(viewerId, u.id)) } },
    select: { pairKey: true, status: true, requesterId: true },
  });
  const byKey = new Map(rows.map((r) => [r.pairKey, r]));
  return users.map((u) => toCard(u, stateOf(byKey.get(pairKey(viewerId, u.id)) ?? null, viewerId)));
}

// ─── Photo privacy ──────────────────────────────────────────────────────────

/**
 * Whether `viewerId` may see `owner`'s planting photos — and so like or comment on them. The owner
 * and admins always can; a block either way never can; otherwise the owner's photo privacy decides.
 */
export async function canSeePhotos(owner: { id: string; photoVisibility: PhotoVisibility }, viewer: { id: string; role: string }) {
  if (owner.id === viewer.id || viewer.role === "ADMIN") return true;
  if (await isBlockedEitherWay(owner.id, viewer.id)) return false;
  if (owner.photoVisibility === "EVERYONE") return true;
  if (owner.photoVisibility === "FRIENDS") return areFriends(owner.id, viewer.id);
  return false;
}
