import bcrypt from "bcryptjs";
import type { PhotoVisibility } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { passwordProblem } from "@/lib/registration";
import { chatMedia, deleteMedia } from "@/lib/storage";
import { deleteAvatar } from "@/lib/avatars";

const BCRYPT_COST = 12;
const VISIBILITIES: PhotoVisibility[] = ["EVERYONE", "FRIENDS", "ONLY_ME"];
const TOGGLES = ["notifyFriendRequests", "notifyLikes", "notifyComments", "showActiveStatus", "allowComments"] as const;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

/** Settings shown on the Settings page. */
export async function getSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      role: true,
      photoVisibility: true,
      notifyFriendRequests: true,
      notifyLikes: true,
      notifyComments: true,
      showActiveStatus: true,
      allowComments: true,
      passwordHash: true,
      accounts: { select: { provider: true } },
    },
  });
}

/** Updates photo privacy, comments, the social notification switches and/or active status. Unknown fields are ignored. */
export async function updateSettings(userId: string, input: Record<string, unknown>) {
  const data: { photoVisibility?: PhotoVisibility } & Partial<Record<(typeof TOGGLES)[number], boolean>> = {};
  if (input.photoVisibility !== undefined) {
    if (!VISIBILITIES.includes(input.photoVisibility as PhotoVisibility)) return fail(400, "Choose who can see your photos.");
    data.photoVisibility = input.photoVisibility as PhotoVisibility;
  }
  for (const key of TOGGLES) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") return fail(400, "Invalid setting.");
    data[key] = input[key] as boolean;
  }
  if (!Object.keys(data).length) return fail(400, "Nothing to update.");
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { photoVisibility: true, notifyFriendRequests: true, notifyLikes: true, notifyComments: true, showActiveStatus: true, allowComments: true },
  });
  return { ok: true as const, settings: user };
}

/**
 * Changes the password (the current one is required), or sets a first password for an account
 * that signs in with Google only.
 */
export async function changePassword(userId: string, current: unknown, next: unknown) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return fail(404, "Account not found.");
  if (user.passwordHash) {
    if (typeof current !== "string" || !(await bcrypt.compare(current, user.passwordHash))) {
      return fail(400, "Your current password is incorrect.");
    }
  }
  const problem = passwordProblem(next);
  if (problem) return fail(400, problem);
  if (user.passwordHash && (await bcrypt.compare(next as string, user.passwordHash))) {
    return fail(400, "Choose a password different from your current one.");
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next as string, BCRYPT_COST) } });
  return { ok: true as const, hadPassword: !!user.passwordHash };
}

export const DELETE_CONFIRMATION = "DELETE";

/**
 * Permanently deletes the account and everything in it (quests and photos, orders, points history,
 * notifications, friends, comments, chats, reports), like scripts/delete-non-admin-users.ts does for one
 * user. Requires typing DELETE and, for accounts with a password, the password. Refused for admins
 * and while a seedling order or cash-out is still in progress — the team may be delivering or
 * paying it.
 */
export async function deleteAccount(userId: string, input: { password?: unknown; confirm?: unknown }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true, avatarUrl: true, passwordHash: true },
  });
  if (!user) return fail(404, "Account not found.");
  if (user.role !== "USER") return fail(403, "Admin and patron accounts can't be deleted here.");
  if (input.confirm !== DELETE_CONFIRMATION) return fail(400, `Type ${DELETE_CONFIRMATION} to confirm.`);
  if (user.passwordHash && (typeof input.password !== "string" || !(await bcrypt.compare(input.password, user.passwordHash)))) {
    return fail(400, "Your password is incorrect.");
  }

  const [openOrders, pendingCashouts] = await Promise.all([
    prisma.order.count({ where: { userId, status: { in: ["PENDING", "PACKED", "OUT_FOR_DELIVERY"] } } }),
    prisma.redemptionHistory.count({ where: { userId, status: "PENDING" } }),
  ]);
  if (openOrders || pendingCashouts) {
    return fail(
      409,
      "You still have a seedling order or cash-out in progress. Wait until it's done (or cancel it), then delete your account.",
    );
  }

  // Chats go with the account for both people (the other side would only see half of it).
  const chats = { members: { some: { userId } } };
  const [verifications, planted, chatFiles, reportFiles] = await Promise.all([
    prisma.verification.findMany({ where: { quest: { userId } }, select: { mediaUrl: true } }),
    prisma.plantedTree.groupBy({ by: ["speciesId"], where: { userId, speciesId: { not: null } }, _sum: { count: true } }),
    prisma.directMessage.findMany({ where: { conversation: chats, mediaKey: { not: null } }, select: { mediaKey: true } }),
    prisma.supportMessage.findMany({ where: { ticket: { userId }, mediaKey: { not: null } }, select: { mediaKey: true } }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const p of planted) {
      await tx.treeSpecies.update({ where: { id: p.speciesId! }, data: { totalPlanted: { decrement: p._sum.count ?? 0 } } });
    }
    await tx.user.updateMany({ where: { referredByUserId: userId }, data: { referredByUserId: null } });
    if (user.email) {
      await tx.pendingRegistration.deleteMany({ where: { email: user.email } });
      await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
    }
    await tx.conversation.deleteMany({ where: chats });
    await tx.user.delete({ where: { id: userId } });
  });

  // Files go only after the database commit succeeded; a failed removal leaves an orphan, nothing worse.
  for (const v of verifications) {
    if (v.mediaUrl.startsWith("/api/media/")) await deleteMedia(v.mediaUrl.slice("/api/media/".length)).catch(() => {});
  }
  for (const m of [...chatFiles, ...reportFiles]) await chatMedia.remove(m.mediaKey!).catch(() => {});
  await deleteAvatar(user.avatarUrl).catch(() => {});
  return { ok: true as const };
}
