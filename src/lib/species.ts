import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { matchSpeciesSlug, TREE_CATEGORY_ORDER, TREE_SPECIES } from "@/data/tree-species";

type Db = PrismaClient | Prisma.TransactionClient;

export function speciesImageUrl(slug: string) {
  return `/api/trees/art/${slug}`;
}

/** Species id for a slot: its explicit link, else a match on its free-text species name. */
export async function speciesIdForSlot(db: Db, slot: { speciesId: string | null; requiredPlantType: string }) {
  if (slot.speciesId) return slot.speciesId;
  const slug = matchSpeciesSlug(slot.requiredPlantType);
  if (!slug) return null;
  return (await db.treeSpecies.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null;
}

/**
 * Records an approved planting (call inside the approval transaction): one PlantedTree row
 * per verification, located at the slot's PSGC city, and bumps the species' running total.
 * Idempotent per verification — a repeat call records nothing.
 */
export async function recordPlanting(
  tx: Prisma.TransactionClient,
  input: {
    verificationId: string;
    userId: string;
    count: number;
    slot: { speciesId: string | null; requiredPlantType: string; cityCode: string };
    plantedAt?: Date;
  },
) {
  const speciesId = await speciesIdForSlot(tx, input.slot);
  const { count } = await tx.plantedTree.createMany({
    data: [
      {
        verificationId: input.verificationId,
        userId: input.userId,
        speciesId,
        psgcCode: input.slot.cityCode,
        count: input.count,
        plantedAt: input.plantedAt ?? new Date(),
      },
    ],
    skipDuplicates: true,
  });
  if (count && speciesId) {
    await tx.treeSpecies.update({ where: { id: speciesId }, data: { totalPlanted: { increment: input.count } } });
  }
  return { speciesId, recorded: count > 0 };
}

// ─── Seeding / maintenance (prisma/seed.ts) ─────────────────────────────────

/** Upserts the catalogue by slug. Keeps live counters and any admin-edited planting goal. */
export async function syncTreeSpecies(db: Db) {
  for (const [i, s] of TREE_SPECIES.entries()) {
    const fields = {
      name: s.name,
      scientificName: s.scientificName,
      category: s.category,
      description: s.description,
      benefits: s.benefits,
      imageUrl: speciesImageUrl(s.slug),
      sortOrder: TREE_CATEGORY_ORDER.indexOf(s.category as (typeof TREE_CATEGORY_ORDER)[number]) * 100 + i,
    };
    await db.treeSpecies.upsert({ where: { slug: s.slug }, create: { slug: s.slug, ...fields }, update: fields });
  }
  return TREE_SPECIES.length;
}

/** Links legacy free-text slots ("Bakawan (mangrove)") to catalogue species where unambiguous. */
export async function linkSlotsToSpecies(db: Db) {
  const slots = await db.slot.findMany({ where: { speciesId: null }, select: { id: true, requiredPlantType: true } });
  let linked = 0;
  for (const slot of slots) {
    const speciesId = await speciesIdForSlot(db, { speciesId: null, requiredPlantType: slot.requiredPlantType });
    if (speciesId) {
      await db.slot.update({ where: { id: slot.id }, data: { speciesId } });
      linked++;
    }
  }
  return linked;
}

/** Creates PlantedTree rows for approvals made before planting records existed. */
export async function backfillPlantedTrees(db: Db) {
  const missing = await db.verification.findMany({
    where: { status: "APPROVED", planted: null },
    select: {
      id: true,
      reviewedAt: true,
      plantCount: true,
      quest: {
        select: {
          userId: true,
          slot: { select: { speciesId: true, requiredPlantType: true, cityCode: true } },
        },
      },
    },
  });
  for (const v of missing) {
    await db.plantedTree.createMany({
      data: [
        {
          verificationId: v.id,
          userId: v.quest.userId,
          speciesId: await speciesIdForSlot(db, v.quest.slot),
          psgcCode: v.quest.slot.cityCode,
          count: v.plantCount,
          plantedAt: v.reviewedAt ?? new Date(),
        },
      ],
      skipDuplicates: true,
    });
  }
  return missing.length;
}

/** Sets every species' totalPlanted from the PlantedTree records (the source of truth). */
export async function recomputeSpeciesTotals(db: Db) {
  const sums = await db.plantedTree.groupBy({ by: ["speciesId"], _sum: { count: true }, where: { speciesId: { not: null } } });
  const bySpecies = new Map(sums.map((s) => [s.speciesId!, s._sum.count ?? 0]));
  const all = await db.treeSpecies.findMany({ select: { id: true } });
  for (const { id } of all) {
    await db.treeSpecies.update({ where: { id }, data: { totalPlanted: bySpecies.get(id) ?? 0 } });
  }
}

/** Full, idempotent seed: catalogue → slot links → backfill → totals. */
export async function seedTreeData(db: Db) {
  const species = await syncTreeSpecies(db);
  const linkedSlots = await linkSlotsToSpecies(db);
  const backfilled = await backfillPlantedTrees(db);
  await recomputeSpeciesTotals(db);
  return { species, linkedSlots, backfilled };
}

/**
 * Species fields for a slot from an admin payload. `speciesId` (catalogue pick) wins and sets
 * the display name; otherwise a free-text `requiredPlantType` is linked when it matches.
 * Returns null fields when the payload doesn't touch the species.
 */
export async function slotSpeciesFromInput(
  db: Db,
  body: Record<string, unknown>,
): Promise<{ ok: true; speciesId?: string | null; requiredPlantType?: string } | { ok: false; error: string }> {
  if (body.speciesId !== undefined) {
    const species =
      typeof body.speciesId === "string"
        ? await db.treeSpecies.findUnique({ where: { id: body.speciesId }, select: { id: true, name: true } })
        : null;
    if (!species) return { ok: false, error: "Unknown tree species." };
    return { ok: true, speciesId: species.id, requiredPlantType: species.name };
  }
  if (typeof body.requiredPlantType === "string" && body.requiredPlantType.trim()) {
    return { ok: true, speciesId: await speciesIdForSlot(db, { speciesId: null, requiredPlantType: body.requiredPlantType }) };
  }
  return { ok: true };
}
