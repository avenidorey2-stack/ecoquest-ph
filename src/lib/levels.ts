import type { Prisma } from "@/generated/prisma/client";

// XP is earned (never spent) and fills the level bar; shop `points` are separate.
// Level L starts at 50·L·(L−1) XP: L2 = 100, L3 = 300, L4 = 600, L5 = 1000 … (each level needs 100 more).
// The gamification migration backfills with the same formula — keep them in sync.

export const XP_PER_PLANT = 20;

const TITLES: [minLevel: number, title: string][] = [
  [1, "Seedling"],
  [2, "Sprout"],
  [3, "Sapling"],
  [5, "Young Tree"],
  [8, "Grove Keeper"],
  [12, "Forest Guardian"],
  [20, "Ancient Narra"],
];

/** Total XP needed to reach `level`. */
export function levelStartXp(level: number) {
  return 50 * level * (level - 1);
}

export function levelForXp(xp: number) {
  const safe = Math.max(0, Math.floor(xp));
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * safe)) / 2));
  // Guard against floating-point edges right at a threshold.
  while (levelStartXp(level + 1) <= safe) level++;
  while (level > 1 && levelStartXp(level) > safe) level--;
  return level;
}

export function levelTitle(level: number) {
  return TITLES.filter(([min]) => level >= min).at(-1)![1];
}

/** Everything a level bar needs. */
export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const start = levelStartXp(level);
  const next = levelStartXp(level + 1);
  return {
    level,
    title: levelTitle(level),
    xp,
    xpIntoLevel: xp - start,
    xpForLevel: next - start,
    xpToNext: next - xp,
    pct: Math.min(100, Math.round(((xp - start) / (next - start)) * 100)),
  };
}

/**
 * Adds XP and raises the stored level to match. The level update is guarded to only ever
 * move up, so concurrent awards can't leave a stale (lower) level behind.
 */
export async function awardXp(tx: Prisma.TransactionClient, userId: string, amount: number) {
  if (amount <= 0) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true, level: true } });
    return { xp: user.xp, level: user.level, previousLevel: user.level };
  }
  const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
  const { xp } = await tx.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true },
  });
  const level = levelForXp(xp);
  await tx.user.updateMany({ where: { id: userId, level: { lt: level } }, data: { level } });
  return { xp, level: Math.max(level, before.level), previousLevel: before.level };
}
