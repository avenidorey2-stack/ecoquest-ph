import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nextWeekStart, weekStart } from "@/lib/week";
import { displayAvatar } from "@/lib/avatar-url";

export type LeaderboardScope = "local" | "national";

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  name: string;
  image: string | null;
  level: number;
  city: string | null;
  province: string | null;
  weeklyPoints: number;
  isViewer: boolean;
};

export type Leaderboard = {
  scope: LeaderboardScope;
  weekStart: Date;
  resetsAt: Date;
  totalRanked: number;
  entries: LeaderboardEntry[];
  /** The viewer's own standing; rank is null if they have no points this week (or aren't eligible). */
  viewer: { rank: number | null; weeklyPoints: number };
};

export const LEADERBOARD_SIZE = 50;

/**
 * Weekly leaderboard. Only regular users (role USER) with points this week are ranked.
 * Ties share a rank (1, 2, 2, 4…). `cityCode` is required for the local scope.
 */
export async function getLeaderboard({
  scope,
  cityCode,
  viewerId,
  limit = LEADERBOARD_SIZE,
  now = new Date(),
}: {
  scope: LeaderboardScope;
  cityCode?: string | null;
  viewerId: string;
  limit?: number;
  now?: Date;
}): Promise<Leaderboard> {
  if (scope === "local" && !cityCode) throw new Error("Local leaderboard needs a cityCode.");

  const week = weekStart(now);
  const where: Prisma.UserWhereInput = {
    role: "USER",
    weeklyPointsWeekStart: week,
    weeklyPoints: { gt: 0 },
    ...(scope === "local" ? { cityCode: cityCode! } : {}),
  };

  const [rows, totalRanked, viewer] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ weeklyPoints: "desc" }, { id: "asc" }],
      take: limit,
      select: { id: true, name: true, image: true, avatarUrl: true, level: true, city: true, province: true, weeklyPoints: true },
    }),
    prisma.user.count({ where }),
    prisma.user.findFirst({ where: { ...where, id: viewerId }, select: { weeklyPoints: true } }),
  ]);

  // Competition ranking: equal scores share a rank.
  let rank = 0;
  const entries = rows.map((row, i) => {
    if (i === 0 || row.weeklyPoints !== rows[i - 1].weeklyPoints) rank = i + 1;
    return {
      rank,
      userId: row.id,
      name: row.name ?? "Anonymous Planter",
      image: displayAvatar(row),
      level: row.level,
      city: row.city,
      province: row.province,
      weeklyPoints: row.weeklyPoints,
      isViewer: row.id === viewerId,
    };
  });

  const viewerRank = viewer
    ? (entries.find((e) => e.isViewer)?.rank ??
      (await prisma.user.count({ where: { ...where, weeklyPoints: { gt: viewer.weeklyPoints } } })) + 1)
    : null;

  return {
    scope,
    weekStart: week,
    resetsAt: nextWeekStart(now),
    totalRanked,
    entries,
    viewer: { rank: viewerRank, weeklyPoints: viewer?.weeklyPoints ?? 0 },
  };
}
