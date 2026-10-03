import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { awardPoints } from "@/lib/points";
import { awardReferralBonusIfDue } from "@/lib/referrals";
import { awardXp, XP_PER_PLANT } from "@/lib/levels";
import { evaluateAchievementsSafely } from "@/lib/achievements";
import { recordPlanting } from "@/lib/species";
import { notify } from "@/lib/notifications";

export const MAX_PLANTS_PER_SUBMISSION = 500;

export class QuestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Approves a pending verification for N plants (the submitted count, or an admin's corrected
 * count): awards N × pointsPerPlant shop points and N × XP_PER_PLANT experience, and adds N to the
 * quest's progress. When progress reaches the quest's goal (targetPlants) the quest completes
 * automatically and the next quest on the same slot unlocks; otherwise it goes back to ACTIVE for
 * more proof — or ends (CANCELLED) if the slot was closed while the proof awaited review. Then
 * (after commit) unlocks any achievements the planter now qualifies for.
 */
export async function approveVerification(
  verificationId: string,
  reviewerId: string,
  plantCountOverride?: number,
) {
  const result = await approveInTransaction(verificationId, reviewerId, plantCountOverride);
  // Achievements read leaderboards etc., so run them after the approval has committed.
  // They never fail the approval itself.
  const achievements = await evaluateAchievementsSafely(result.quest.userId);
  if (result.referralBonus) await evaluateAchievementsSafely(result.referralBonus.referrerId);
  return { ...result, achievements };
}

function approveInTransaction(verificationId: string, reviewerId: string, plantCountOverride?: number) {
  return prisma.$transaction(async (tx) => {
    await lockQuestSlot(tx, verificationId);
    // Guarded update so a verification can only be approved once.
    const { count } = await tx.verification.updateMany({
      where: { id: verificationId, status: "PENDING" },
      data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (count === 0) throw new QuestError("Verification not found or already reviewed.", 409);

    const verification = await tx.verification.findUniqueOrThrow({
      where: { id: verificationId },
      include: { quest: { include: { slot: true } } },
    });
    const { quest } = verification;
    const slotOpen = isSlotOpen(quest.slot);

    const plantCount = plantCountOverride ?? verification.plantCount;
    if (plantCount < 1) throw new QuestError("Plant count must be at least 1.", 400);
    const points = plantCount * quest.slot.pointsPerPlant;
    if (plantCount !== verification.plantCount) {
      // Record the count that was actually approved on the submission itself.
      await tx.verification.update({ where: { id: verificationId }, data: { plantCount } });
    }

    // Progress increments by exactly the approved count (atomic increment).
    const progressed = await tx.quest.update({
      where: { id: quest.id },
      data: { plantCount: { increment: plantCount }, pointsAwarded: { increment: points } },
    });
    const goalReached = progressed.plantCount >= progressed.targetPlants;
    // Short of the goal it reopens for more proof — unless the slot was closed meanwhile.
    const updatedQuest = await tx.quest.update({
      where: { id: quest.id },
      data: goalReached ? { status: "COMPLETED", completedAt: new Date() } : { status: slotOpen ? "ACTIVE" : "CANCELLED" },
    });

    await awardPoints(tx, quest.userId, points, plantCount);
    const xp = await awardXp(tx, quest.userId, plantCount * XP_PER_PLANT);
    // Planting record (species + PSGC location) and the species' running total.
    const planting = await recordPlanting(tx, {
      verificationId,
      userId: quest.userId,
      count: plantCount,
      slot: quest.slot,
    });
    const referralBonus = await awardReferralBonusIfDue(tx, quest.userId);

    const progress = `${updatedQuest.plantCount}/${updatedQuest.targetPlants}`;
    await notify(
      tx,
      quest.userId,
      goalReached
        ? `Quest complete! You planted ${updatedQuest.plantCount} ${quest.slot.requiredPlantType} — +${points.toLocaleString("en-PH")} pts for this proof.`
        : slotOpen
          ? `Tree approved! +${points.toLocaleString("en-PH")} pts for ${plantCount} ${quest.slot.requiredPlantType} — ${progress} planted. Submit proof for the rest.`
          : `Tree approved! +${points.toLocaleString("en-PH")} pts for ${plantCount} ${quest.slot.requiredPlantType} — ${progress} planted. This slot is closed, so the quest has ended.`,
      "/dashboard",
    );
    if (referralBonus) {
      await notify(
        tx,
        referralBonus.referrerId,
        `Referral bonus! +${referralBonus.points} pts — a friend you invited completed their first planting.`,
        "/referrals",
      );
    }

    // Quest chaining: completing a quest immediately unlocks the next one on the same slot.
    const nextQuest =
      goalReached && slotOpen && quest.slot.status === "OPEN"
        ? await tx.quest.create({
            data: { userId: quest.userId, slotId: quest.slotId, status: "ACTIVE", targetPlants: quest.slot.questGoal },
          })
        : null;

    return {
      quest: updatedQuest,
      goalReached,
      pointsAwarded: points,
      xpAwarded: plantCount * XP_PER_PLANT,
      level: xp.level,
      leveledUp: xp.level > xp.previousLevel,
      speciesId: planting.speciesId,
      nextQuest,
      referralBonus,
    };
  });
}

/** Rejects a pending verification and reopens the quest for a new submission (or ends it on a closed slot). */
export async function rejectVerification(verificationId: string, reviewerId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    await lockQuestSlot(tx, verificationId);
    const { count } = await tx.verification.updateMany({
      where: { id: verificationId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: reason?.trim() || null,
      },
    });
    if (count === 0) throw new QuestError("Verification not found or already reviewed.", 409);

    const { questId, quest } = await tx.verification.findUniqueOrThrow({
      where: { id: verificationId },
      select: {
        questId: true,
        quest: { select: { userId: true, slot: { select: { requiredPlantType: true, status: true, deletedAt: true } } } },
      },
    });
    const why = reason?.trim();
    // Normally the quest reopens for new proof — but not on a slot that was closed meanwhile.
    const slotOpen = isSlotOpen(quest.slot);
    await notify(
      tx,
      quest.userId,
      `Your ${quest.slot.requiredPlantType} proof was not approved${why ? `: ${why}` : ""}. ` +
        (slotOpen ? "Please submit new proof." : "This slot is closed, so the quest has ended."),
      "/dashboard",
    );
    return tx.quest.update({ where: { id: questId }, data: { status: slotOpen ? "ACTIVE" : "CANCELLED" } });
  });
}

export const SLOT_CLOSED = "This slot has been closed, so it no longer accepts proof.";

/** A slot accepts proof unless an admin closed or removed it (FULL only stops new claims). */
export function isSlotOpen(slot: { status: string; deletedAt: Date | null }) {
  return slot.status !== "CLOSED" && !slot.deletedAt;
}

/**
 * Shared lock on the slot of a verification's quest — taken first, before any row the review
 * changes. Closing/removing a slot takes an exclusive lock on the same row first too, so a review
 * either finishes before the close (which then ends the reopened quest) or waits and sees the slot
 * closed, and the two can never deadlock.
 */
async function lockQuestSlot(tx: Prisma.TransactionClient, verificationId: string) {
  await tx.$queryRaw`
    SELECT 1 FROM "Slot" s JOIN "Quest" q ON q."slotId" = s."id" JOIN "Verification" v ON v."questId" = q."id"
    WHERE v."id" = ${verificationId} FOR SHARE OF s`;
}
