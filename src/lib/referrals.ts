import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { awardPoints } from "@/lib/points";

/** Points the referrer earns when an invited user's first planting is verified. */
export const REFERRAL_BONUS_POINTS = 100;
/** Cookie that carries an invite code from /r/<code> through sign-up. */
export const REFERRAL_COOKIE = "eq_ref";

export type AttachResult =
  | { ok: true; referrer: { id: string; name: string | null } }
  | { ok: false; error: string };

/**
 * Links a user to the owner of `code`. Only allowed before the user's first verified
 * planting (the bonus trigger), never to themselves, and not in a 2-person loop.
 */
export async function attachReferral(userId: string, code: unknown): Promise<AttachResult> {
  if (typeof code !== "string" || !code.trim()) return { ok: false, error: "Enter an invite code." };

  const [user, referrer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { referredByUserId: true, _count: { select: { quests: { where: { status: "COMPLETED" } } } } },
    }),
    prisma.user.findUnique({
      where: { referralCode: code.trim() },
      select: { id: true, name: true, referredByUserId: true },
    }),
  ]);

  if (!user) return { ok: false, error: "User not found." };
  if (user.referredByUserId) return { ok: false, error: "You've already used an invite code." };
  if (user._count.quests > 0) {
    return { ok: false, error: "Invite codes can only be used before your first verified planting." };
  }
  if (!referrer) return { ok: false, error: "That invite code doesn't exist." };
  if (referrer.id === userId) return { ok: false, error: "You can't use your own invite code." };
  if (referrer.referredByUserId === userId) {
    return { ok: false, error: "You can't use the code of someone you invited." };
  }

  // Guarded so concurrent attempts can't overwrite an existing referrer.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, referredByUserId: null },
    data: { referredByUserId: referrer.id },
  });
  if (count === 0) return { ok: false, error: "You've already used an invite code." };
  return { ok: true, referrer: { id: referrer.id, name: referrer.name } };
}

/**
 * Pays the referrer once, the first time the referred user has a planting verified.
 * Call inside the approval transaction. Returns the payout, or null if none was due.
 */
export async function awardReferralBonusIfDue(tx: Prisma.TransactionClient, refereeId: string) {
  const referee = await tx.user.findUnique({
    where: { id: refereeId },
    select: { referredByUserId: true, referralBonusAwardedAt: true },
  });
  if (!referee?.referredByUserId || referee.referralBonusAwardedAt) return null;

  const { count } = await tx.user.updateMany({
    where: { id: refereeId, referralBonusAwardedAt: null },
    data: { referralBonusAwardedAt: new Date() },
  });
  if (count === 0) return null;

  await awardPoints(tx, referee.referredByUserId, REFERRAL_BONUS_POINTS);
  return { referrerId: referee.referredByUserId, points: REFERRAL_BONUS_POINTS };
}

export async function getReferralSummary(userId: string) {
  const referrals = await prisma.user.findMany({
    where: { referredByUserId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, referralBonusAwardedAt: true },
  });
  const qualified = referrals.filter((r) => r.referralBonusAwardedAt).length;
  return {
    referrals: referrals.map((r) => ({
      id: r.id,
      name: r.name ?? "New Planter",
      joinedAt: r.createdAt,
      bonusAwarded: !!r.referralBonusAwardedAt,
    })),
    invited: referrals.length,
    qualified,
    pointsEarned: qualified * REFERRAL_BONUS_POINTS,
  };
}
