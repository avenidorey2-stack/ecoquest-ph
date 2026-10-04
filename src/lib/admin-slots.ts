import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { listRegions, resolveCity } from "@/lib/psgc";
import { deleteMedia } from "@/lib/storage";
import { holdsSpot, isClaimExpired } from "@/lib/quests";
import { notify } from "@/lib/notifications";

/** Planter notice when a slot closes (or is removed) while their quest there is active. */
export function slotClosedNotice(slot: { requiredPlantType: string; city: string }) {
  return `The ${slot.requiredPlantType} slot in ${slot.city} is now closed, so your quest there has ended. Plants and points already approved are yours to keep.`;
}

/**
 * Ends the in-progress quests of a slot that was just closed or removed — call it inside the
 * transaction that changed the slot, after locking the slot row. Quests are never deleted: they
 * become CANCELLED and keep their approved plants, points and proof. Every affected planter is
 * notified.
 * - closed: a quest whose proof is awaiting review keeps it, so the admin can still approve that
 *   planting; the review then ends the quest (see quests.ts) instead of reopening it.
 * - removed: every in-progress quest is cancelled and its unapproved proof rows dropped; their
 *   files are returned in `mediaKeys` for the caller to delete after the transaction commits.
 */
export async function endSlotQuests(
  tx: Prisma.TransactionClient,
  slot: { id: string; requiredPlantType: string; city: string },
  { reason }: { reason: "closed" | "removed" },
) {
  // Row locks: a proof submission or review that is mid-flight finishes first, and later ones
  // see the slot closed (they lock the slot row before touching the quest).
  const quests = await tx.$queryRaw<{ id: string; userId: string; status: "ACTIVE" | "PENDING_VERIFICATION" }[]>`
    SELECT "id", "userId", "status"::text AS "status" FROM "Quest"
    WHERE "slotId" = ${slot.id} AND "status" IN ('ACTIVE', 'PENDING_VERIFICATION')
    FOR UPDATE`;
  const keepReview = reason === "closed";
  const cancelled = quests.filter((q) => !keepReview || q.status === "ACTIVE");
  const awaitingReview = quests.filter((q) => keepReview && q.status === "PENDING_VERIFICATION");
  const cancelledIds = cancelled.map((q) => q.id);

  let mediaKeys: string[] = [];
  if (cancelledIds.length) {
    if (!keepReview) {
      // Approved proof is a permanent record; only proof that was never approved goes.
      const dropped = await tx.verification.findMany({
        where: { questId: { in: cancelledIds }, status: { not: "APPROVED" } },
        select: { id: true, mediaUrl: true },
      });
      await tx.verification.deleteMany({ where: { id: { in: dropped.map((v) => v.id) } } });
      mediaKeys = dropped.map((v) => v.mediaUrl.split("/").pop() ?? "");
    }
    await tx.quest.updateMany({ where: { id: { in: cancelledIds } }, data: { status: "CANCELLED" } });
  }

  // To planters a removed slot is simply closed: the notices never say who closed it.
  const notices = [
    ...cancelled.map((q) => ({ userId: q.userId, message: slotClosedNotice(slot) })),
    ...awaitingReview.map((q) => ({
      userId: q.userId,
      message: `The ${slot.requiredPlantType} slot in ${slot.city} is now closed. Your proof awaiting review will still be reviewed, but no new proof can be submitted there.`,
    })),
  ];
  if (notices.length) {
    await tx.notification.createMany({ data: notices.map((n) => ({ ...n, link: "/dashboard" })) });
  }
  return { cancelledQuests: cancelled.length, awaitingReview: awaitingReview.length, notified: notices.length, mediaKeys };
}

/**
 * Admin slot edit. Closing a slot (status → CLOSED) also ends its in-progress quests and notifies
 * those planters (endSlotQuests). Returns null if there is no such slot.
 */
export async function updateSlot(slotId: string, data: Prisma.SlotUncheckedUpdateInput) {
  return prisma.$transaction(async (tx) => {
    // Exclusive lock on the slot row first, so concurrent submissions/reviews wait for the close.
    const [before] = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "Slot" WHERE "id" = ${slotId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!before) return null;

    const slot = await tx.slot.update({ where: { id: slotId }, data });
    if (slot.status !== "CLOSED" || before.status === "CLOSED") return { slot, closed: null };
    const { cancelledQuests, awaitingReview, notified } = await endSlotQuests(tx, slot, { reason: "closed" });
    return { slot, closed: { cancelledQuests, awaitingReview, notified } };
  });
}

/** Data for the admin slot manager (/admin/slots). */
export async function loadAdminSlotData() {
  const [species, slots] = await Promise.all([
    prisma.treeSpecies.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, category: true },
    }),
    prisma.slot.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      omit: { createdAt: true, updatedAt: true, deletedAt: true },
      include: { _count: { select: { quests: true } } },
    }),
  ]);
  // Planters holding a spot (expired claims don't).
  const active = await prisma.quest.groupBy({ by: ["slotId"], where: holdsSpot(), _count: true });
  const activeBySlot = new Map(active.map((a) => [a.slotId, a._count]));

  return {
    regions: listRegions(),
    species,
    slots: slots.map(({ _count, ...slot }) => {
      const place = resolveCity(slot.cityCode);
      return {
        ...slot,
        regionCode: place?.regionCode ?? "",
        provinceCode: place?.provinceCode ?? "",
        activeQuests: activeBySlot.get(slot.id) ?? 0,
        totalQuests: _count.quests,
      };
    }),
  };
}

/**
 * Admin "delete permanently". Approved proof and planted trees are permanent records on planters'
 * profiles, so they always survive:
 * - Slot with approved plantings: the slot disappears from every list and map (soft delete via
 *   `deletedAt`); in-progress quests (active / awaiting review) are cancelled — not deleted, since a
 *   part-done quest holds approved proof and trees — and their unapproved proof removed
 *   (endSlotQuests). Completed quests, approved proof and planted trees stay.
 * - Slot without approved plantings: the slot and all its quests are erased (hard delete).
 * Planters with a quest in progress are notified. Returns null if there is no such slot.
 */
export async function deleteSlotPermanently(slotId: string) {
  const result = await prisma.$transaction(async (tx) => {
    // Exclusive lock on the slot row first (same order as closing, submitting and reviewing).
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Slot" WHERE "id" = ${slotId} AND "deletedAt" IS NULL FOR UPDATE`;
    if (!locked) return null;
    const slot = await tx.slot.findUniqueOrThrow({ where: { id: slotId }, select: { id: true, city: true, requiredPlantType: true } });

    const keepHistory = (await tx.verification.count({ where: { status: "APPROVED", quest: { slotId } } })) > 0;
    if (keepHistory) {
      const ended = await endSlotQuests(tx, slot, { reason: "removed" });
      await tx.slot.update({ where: { id: slotId }, data: { deletedAt: new Date(), status: "CLOSED" } });
      return { keepHistory, removedQuests: ended.cancelledQuests, mediaKeys: ended.mediaKeys, notified: ended.notified };
    }

    // Nothing was ever approved here: erase the slot with every quest and proof on it.
    const quests = await tx.quest.findMany({
      where: { slotId },
      select: { userId: true, status: true, verifications: { select: { mediaUrl: true } } },
    });
    const notifyIds = [
      ...new Set(quests.filter((q) => q.status === "ACTIVE" || q.status === "PENDING_VERIFICATION").map((q) => q.userId)),
    ];
    if (notifyIds.length) {
      await tx.notification.createMany({
        data: notifyIds.map((userId) => ({
          userId,
          message: slotClosedNotice(slot),
          link: "/dashboard",
        })),
      });
    }
    const mediaKeys = quests.flatMap((q) => q.verifications.map((v) => v.mediaUrl.split("/").pop() ?? ""));
    await tx.slot.delete({ where: { id: slotId } }); // cascades to its quests and their (unapproved) proof rows
    return { keepHistory, removedQuests: quests.length, mediaKeys, notified: notifyIds.length };
  });
  if (!result) return null;

  // Files go only after the rows are gone, so a failed transaction never orphans live proof.
  await Promise.all(result.mediaKeys.map((key) => deleteMedia(key)));
  return {
    keptApprovedHistory: result.keepHistory,
    deletedQuests: result.removedQuests,
    deletedMedia: result.mediaKeys.length,
    notified: result.notified,
  };
}

const MAX_CLAIM_DAYS_AHEAD = 365;
const fmtDay = (d: Date) => d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

/** In-progress claims on a slot (active or awaiting review), soonest deadline first. */
export async function listSlotClaims(slotId: string, now = new Date()) {
  const quests = await prisma.quest.findMany({
    where: { slotId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      plantCount: true,
      targetPlants: true,
      createdAt: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return quests.map((q) => ({ ...q, expired: isClaimExpired(q, now) }));
}

/**
 * Admin sets a claim's deadline to the end of `day` ("YYYY-MM-DD", Philippine time). Extending an
 * expired claim lets the planter submit proof there again. The planter is notified.
 */
export async function setClaimExpiry(questId: string, day: unknown, now = new Date()) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { error: "Choose a valid date.", status: 400 } as const;
  }
  const expiresAt = new Date(`${day}T23:59:59.999+08:00`);
  // 23:59 PHT is 15:59 UTC the same day, so a rolled-over date (e.g. Feb 31) won't match.
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== day) {
    return { error: "Choose a valid date.", status: 400 } as const;
  }
  if (expiresAt.getTime() - now.getTime() > MAX_CLAIM_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
    return { error: "Choose a date within a year.", status: 400 } as const;
  }

  return prisma.$transaction(async (tx) => {
    const quest = await tx.quest.findUnique({
      where: { id: questId },
      select: { userId: true, status: true, expiresAt: true, slot: { select: { requiredPlantType: true, city: true } } },
    });
    if (!quest) return { error: "Claim not found.", status: 404 } as const;
    if (quest.status !== "ACTIVE" && quest.status !== "PENDING_VERIFICATION") {
      return { error: "This quest has already ended.", status: 409 } as const;
    }
    const updated = await tx.quest.update({ where: { id: questId }, data: { expiresAt, expiryRemindedAt: null }, select: { id: true, expiresAt: true } });

    const where = `${quest.slot.requiredPlantType} slot in ${quest.slot.city}`;
    const wasExpired = isClaimExpired(quest, now);
    const message =
      expiresAt <= now
        ? `Your claim on the ${where} has ended. Plants and points already approved are yours to keep.`
        : wasExpired
          ? `Good news! Your claim on the ${where} is active again until ${fmtDay(expiresAt)}. You can plant and send proof there.`
          : `Your claim on the ${where} now lasts until ${fmtDay(expiresAt)}.`;
    await notify(tx, quest.userId, message, "/dashboard");
    return { claim: { ...updated, expired: expiresAt <= now } };
  });
}
