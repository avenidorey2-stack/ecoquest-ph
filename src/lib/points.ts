import type { Prisma } from "@/generated/prisma/client";
import { weekStart } from "@/lib/week";

/**
 * Adds points (and optionally plants) to a user's totals and weekly score.
 * If the stored weekly score belongs to an earlier week it is replaced, not added to.
 *
 * Both branches are guarded updates, so concurrent awards can't overwrite each other:
 * if another transaction rolls the week over first, the "same week" branch matches on retry.
 */
export async function awardPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  points: number,
  plants = 0,
  now = new Date(),
) {
  const week = weekStart(now);
  const totals = { points: { increment: points }, totalPlants: { increment: plants } };

  for (let attempt = 0; attempt < 3; attempt++) {
    const sameWeek = await tx.user.updateMany({
      where: { id: userId, weeklyPointsWeekStart: week },
      data: { ...totals, weeklyPoints: { increment: points } },
    });
    if (sameWeek.count) return;

    const newWeek = await tx.user.updateMany({
      where: { id: userId, OR: [{ weeklyPointsWeekStart: null }, { weeklyPointsWeekStart: { not: week } }] },
      data: { ...totals, weeklyPoints: points, weeklyPointsWeekStart: week },
    });
    if (newWeek.count) return;
  }
  throw new Error(`awardPoints: user ${userId} not found`);
}
