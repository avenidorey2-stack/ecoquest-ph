import { prisma } from "@/lib/prisma";

export type PlantingImpact = {
  /** Verified plants across the whole country. */
  national: number;
  /** Verified plants in the given PSGC city (0 when no city). */
  local: number;
  /** Local share of the national total, 0–100 (one decimal). */
  localSharePct: number;
};

/** National vs local (PSGC city) totals of approved plantings. */
export async function getPlantingImpact(psgcCode: string | null): Promise<PlantingImpact> {
  const [national, local] = await Promise.all([
    prisma.plantedTree.aggregate({ _sum: { count: true } }),
    psgcCode ? prisma.plantedTree.aggregate({ where: { psgcCode }, _sum: { count: true } }) : null,
  ]);
  const n = national._sum.count ?? 0;
  const l = local?._sum.count ?? 0;
  return { national: n, local: l, localSharePct: n > 0 ? Math.round((l / n) * 1000) / 10 : 0 };
}
