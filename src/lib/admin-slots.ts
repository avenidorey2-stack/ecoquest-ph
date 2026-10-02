import { prisma } from "@/lib/prisma";
import { listRegions, resolveCity } from "@/lib/psgc";
import { deleteMedia } from "@/lib/storage";

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
  const active = await prisma.quest.groupBy({
    by: ["slotId"],
    where: { status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
    _count: true,
  });
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
 *   `deletedAt`); in-progress quests (active / awaiting review) are cancelled and their unapproved
 *   proof files removed. Completed quests, approved proof and planted trees stay.
 * - Slot without approved plantings: the slot and all its quests are erased (hard delete).
 * Planters with a quest in progress are notified. Returns null if there is no such slot.
 */
export async function deleteSlotPermanently(slotId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const slot = await tx.slot.findFirst({
      where: { id: slotId, deletedAt: null },
      select: {
        city: true,
        requiredPlantType: true,
        quests: {
          select: { id: true, userId: true, status: true, verifications: { select: { mediaUrl: true, status: true } } },
        },
      },
    });
    if (!slot) return null;

    const inProgress = slot.quests.filter((q) => q.status === "ACTIVE" || q.status === "PENDING_VERIFICATION");
    const notifyIds = [...new Set(inProgress.map((q) => q.userId))];
    if (notifyIds.length) {
      await tx.notification.createMany({
        data: notifyIds.map((userId) => ({
          userId,
          message: `The ${slot.requiredPlantType} slot in ${slot.city} was removed by an admin, so your quest there was cancelled.`,
          link: "/dashboard",
        })),
      });
    }

    const keepHistory = slot.quests.some((q) => q.verifications.some((v) => v.status === "APPROVED"));
    const removed = keepHistory ? inProgress : slot.quests;
    // Approved proof is never deleted — only the files of proof that was never approved.
    const mediaKeys = removed.flatMap((q) =>
      q.verifications.filter((v) => v.status !== "APPROVED").map((v) => v.mediaUrl.split("/").pop() ?? ""),
    );

    if (keepHistory) {
      await tx.quest.deleteMany({ where: { id: { in: inProgress.map((q) => q.id) } } });
      await tx.slot.update({ where: { id: slotId }, data: { deletedAt: new Date(), status: "CLOSED" } });
    } else {
      await tx.slot.delete({ where: { id: slotId } }); // cascades to its quests and their (unapproved) proof rows
    }
    return { keepHistory, removedQuests: removed.length, mediaKeys, notified: notifyIds.length };
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
