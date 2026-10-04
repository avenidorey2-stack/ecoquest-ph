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

export type CommunityStats = { plants: number; planters: number; cities: number };

/** Headline numbers for the sign-in pages: verified plants, planters, cities with plantings. */
export async function getCommunityStats(): Promise<CommunityStats> {
  const [plants, planters, cities] = await Promise.all([
    prisma.plantedTree.aggregate({ _sum: { count: true } }),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.plantedTree.groupBy({ by: ["psgcCode"] }),
  ]);
  return { plants: plants._sum.count ?? 0, planters, cities: cities.length };
}
