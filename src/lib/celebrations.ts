import { prisma } from "@/lib/prisma";
import { getLeaderboard } from "@/lib/leaderboard";
import { achievementName, ACHIEVEMENTS } from "@/lib/achievements";
import { levelTitle } from "@/lib/levels";
import { weekStart } from "@/lib/week";

// What the user hasn't been shown yet: a level-up, newly unlocked badges, a leaderboard climb.
// Each is acknowledged via POST /api/celebrations so it plays once.

export type RankUp = { scope: "local" | "national"; from: number; to: number; passed: string | null; place: string };
export type PendingCelebrations = {
  levelUp: { from: number; to: number; title: string } | null;
  achievements: { key: string; name: string; icon: string; xpReward: number }[];
  rankUp: RankUp | null;
};

/** The user's current weekly rank (city if set, else national), or null if unranked. */
async function currentRank(userId: string, cityCode: string | null, now: Date) {
  const board = await getLeaderboard({
    scope: cityCode ? "local" : "national",
    cityCode,
    viewerId: userId,
    limit: 1,
    now,
  });
  return { scope: board.scope, rank: board.viewer.rank, points: board.viewer.weeklyPoints };
}

/**
 * Detects a leaderboard climb since the user last looked. Keeps the baseline current:
 * a new week or a drop silently resets it, so the next climb is measured from there.
 */
async function detectRankUp(
  user: { id: string; cityCode: string | null; city: string | null; lastRankSeen: number | null; lastRankWeekStart: Date | null },
  now: Date,
): Promise<RankUp | null> {
  const { scope, rank, points } = await currentRank(user.id, user.cityCode, now);
  if (rank === null) return null;

  const week = weekStart(now);
  const sameWeek = user.lastRankWeekStart?.getTime() === week.getTime();
  if (!sameWeek || user.lastRankSeen === null || rank > user.lastRankSeen) {
    await prisma.user.update({ where: { id: user.id }, data: { lastRankSeen: rank, lastRankWeekStart: week } });
    return null;
  }
  if (rank === user.lastRankSeen) return null;

  // Who did they just overtake? The planter now directly below them.
  const below = await prisma.user.findFirst({
    where: {
      role: "USER",
      id: { not: user.id },
      weeklyPointsWeekStart: week,
      weeklyPoints: { lt: points, gt: 0 },
      ...(scope === "local" ? { cityCode: user.cityCode } : {}),
    },
    orderBy: [{ weeklyPoints: "desc" }, { id: "asc" }],
    select: { name: true },
  });
  return {
    scope,
    from: user.lastRankSeen,
    to: rank,
    passed: below?.name ?? null,
    place: scope === "local" ? (user.city ?? "your city") : "the Philippines",
  };
}

export async function getPendingCelebrations(userId: string, now = new Date()): Promise<PendingCelebrations> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, level: true, lastLevelSeen: true, cityCode: true, city: true, lastRankSeen: true, lastRankWeekStart: true },
  });
  const [unseen, rankUp] = await Promise.all([
    prisma.userAchievement.findMany({
      where: { userId, seenAt: null },
      orderBy: { unlockedAt: "asc" },
      select: { detail: true, achievement: { select: { key: true } } },
    }),
    detectRankUp(user, now),
  ]);
  const byKey = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

  return {
    levelUp: user.level > user.lastLevelSeen ? { from: user.lastLevelSeen, to: user.level, title: levelTitle(user.level) } : null,
    achievements: unseen.flatMap(({ detail, achievement: { key } }) => {
      const def = byKey.get(key);
      return def ? [{ key, name: achievementName(key, detail), icon: def.icon, xpReward: def.xpReward }] : [];
    }),
    rankUp,
  };
}

export type CelebrationKind = "level" | "achievements" | "rank";

/** Marks a celebration as shown. Values come from the server's state, never the client. */
export async function acknowledgeCelebration(userId: string, kind: CelebrationKind, now = new Date()) {
  if (kind === "level") {
    const { level } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
    await prisma.user.update({ where: { id: userId }, data: { lastLevelSeen: level } });
  } else if (kind === "achievements") {
    await prisma.userAchievement.updateMany({ where: { userId, seenAt: null }, data: { seenAt: now } });
  } else {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { cityCode: true } });
    const { rank } = await currentRank(userId, user.cityCode, now);
    await prisma.user.update({
      where: { id: userId },
      data: { lastRankSeen: rank, lastRankWeekStart: rank === null ? null : weekStart(now) },
    });
  }
}
