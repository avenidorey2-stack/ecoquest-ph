import { prisma } from "@/lib/prisma";
import { getLeaderboard } from "@/lib/leaderboard";
import { awardXp } from "@/lib/levels";

// Badge catalogue — the source of truth. The Achievement table mirrors it (by `key`) so
// unlocks have something to reference; names/descriptions shown in the UI come from here.

export type AchievementStats = {
  totalPlants: number;
  speciesCount: number;
  plantedMangrove: boolean;
  qualifiedReferrals: number;
  level: number;
  city: string | null;
  cityRank: number | null;
  nationalRank: number | null;
};

type Definition = {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: "Planting" | "Biodiversity" | "Leaderboard" | "Community" | "Growth";
  xpReward: number;
  /** Truthy when earned; a string is stored as the unlock's detail (e.g. the city). */
  check: (s: AchievementStats) => boolean | string;
  progress?: (s: AchievementStats) => { current: number; target: number };
};

const trees = (key: string, name: string, icon: string, target: number, xpReward: number, description?: string): Definition => ({
  key,
  name,
  icon,
  category: "Planting",
  xpReward,
  description: description ?? `Get ${target} trees verified.`,
  check: (s) => s.totalPlants >= target,
  progress: (s) => ({ current: Math.min(s.totalPlants, target), target }),
});

export const ACHIEVEMENTS: Definition[] = [
  trees("first-tree", "First Tree Planted", "🌱", 1, 50, "Get your first planting verified."),
  trees("trees-10", "Green Thumb", "🌿", 10, 100),
  trees("trees-50", "Grove Builder", "🌳", 50, 250),
  trees("trees-100", "100 Trees Milestone", "🏞️", 100, 500),
  trees("trees-500", "Forest Maker", "🌲", 500, 1500),
  {
    key: "mangrove",
    name: "Mangrove Guardian",
    description: "Plant a mangrove species such as Bakawan or Pagatpat.",
    icon: "🌊",
    category: "Biodiversity",
    xpReward: 100,
    check: (s) => s.plantedMangrove,
  },
  {
    key: "species-3",
    name: "Biodiversity Champion",
    description: "Plant three different tree species.",
    icon: "🦋",
    category: "Biodiversity",
    xpReward: 150,
    check: (s) => s.speciesCount >= 3,
    progress: (s) => ({ current: Math.min(s.speciesCount, 3), target: 3 }),
  },
  {
    key: "city-top-10",
    name: "City Top 10",
    description: "Reach your city's weekly top 10.",
    icon: "🏅",
    category: "Leaderboard",
    xpReward: 150,
    check: (s) => (s.cityRank !== null && s.cityRank <= 10 && s.city ? s.city : false),
  },
  {
    key: "city-champion",
    name: "City Champion",
    description: "Reach #1 in your city's weekly leaderboard.",
    icon: "👑",
    category: "Leaderboard",
    xpReward: 300,
    check: (s) => (s.cityRank === 1 && s.city ? s.city : false),
  },
  {
    key: "national-top-10",
    name: "National Top 10",
    description: "Reach the national weekly top 10.",
    icon: "🏆", // not a flag emoji — Windows renders flags as letters
    category: "Leaderboard",
    xpReward: 400,
    check: (s) => s.nationalRank !== null && s.nationalRank <= 10,
  },
  {
    key: "referral-1",
    name: "Recruiter",
    description: "A friend you invited gets their first planting verified.",
    icon: "🤝",
    category: "Community",
    xpReward: 100,
    check: (s) => s.qualifiedReferrals >= 1,
    progress: (s) => ({ current: Math.min(s.qualifiedReferrals, 1), target: 1 }),
  },
  {
    key: "referral-3",
    name: "Community Builder",
    description: "Three invited friends get their first planting verified.",
    icon: "🏘️",
    category: "Community",
    xpReward: 300,
    check: (s) => s.qualifiedReferrals >= 3,
    progress: (s) => ({ current: Math.min(s.qualifiedReferrals, 3), target: 3 }),
  },
  {
    key: "level-5",
    name: "Rising Forester",
    description: "Reach level 5.",
    icon: "⭐",
    category: "Growth",
    xpReward: 0,
    check: (s) => s.level >= 5,
    progress: (s) => ({ current: Math.min(s.level, 5), target: 5 }),
  },
  {
    key: "level-10",
    name: "Forest Guardian",
    description: "Reach level 10.",
    icon: "🌟",
    category: "Growth",
    xpReward: 0,
    check: (s) => s.level >= 10,
    progress: (s) => ({ current: Math.min(s.level, 10), target: 10 }),
  },
];

const BY_KEY = new Map(ACHIEVEMENTS.map((a, i) => [a.key, { ...a, sortOrder: i }]));

const MANGROVE = /bakawan|bakauan|bakhaw|mangrove|pagatpat|bungalon|api-?api|tabigi|pototan|nipa/i;

/** "City Top 10" → "City of Cebu Top 10" when unlocked with a city detail. */
export function achievementName(key: string, detail?: string | null) {
  const def = BY_KEY.get(key);
  if (!def) return key;
  if (detail && key === "city-top-10") return `${detail} Top 10`;
  if (detail && key === "city-champion") return `${detail} Champion`;
  return def.name;
}

/** Ensures every catalogue entry has a row; returns key → id. */
async function syncCatalog() {
  const existing = await prisma.achievement.findMany({ select: { id: true, key: true } });
  const have = new Set(existing.map((a) => a.key));
  const missing = ACHIEVEMENTS.filter((a) => !have.has(a.key));
  if (missing.length) {
    await prisma.achievement.createMany({
      data: missing.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        xpReward: a.xpReward,
        sortOrder: BY_KEY.get(a.key)!.sortOrder,
      })),
      skipDuplicates: true,
    });
    return new Map((await prisma.achievement.findMany({ select: { id: true, key: true } })).map((a) => [a.key, a.id]));
  }
  return new Map(existing.map((a) => [a.key, a.id]));
}

export async function gatherStats(userId: string, now = new Date()): Promise<AchievementStats> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { totalPlants: true, level: true, cityCode: true, city: true },
  });
  const [completed, qualifiedReferrals, national, local] = await Promise.all([
    prisma.quest.findMany({
      where: { userId, status: "COMPLETED" },
      select: { slot: { select: { requiredPlantType: true } } },
    }),
    prisma.user.count({ where: { referredByUserId: userId, referralBonusAwardedAt: { not: null } } }),
    getLeaderboard({ scope: "national", viewerId: userId, limit: 1, now }),
    user.cityCode ? getLeaderboard({ scope: "local", cityCode: user.cityCode, viewerId: userId, limit: 1, now }) : null,
  ]);
  const species = new Set(completed.map((q) => q.slot.requiredPlantType.trim().toLowerCase()));
  return {
    totalPlants: user.totalPlants,
    speciesCount: species.size,
    plantedMangrove: [...species].some((s) => MANGROVE.test(s)),
    qualifiedReferrals,
    level: user.level,
    city: user.city,
    cityRank: local?.viewer.rank ?? null,
    nationalRank: national.viewer.rank,
  };
}

export type Unlock = { key: string; name: string; icon: string; xpReward: number };

/**
 * Awards every achievement the user now qualifies for (idempotent) and their XP rewards.
 * Re-checks after awarding, since badge XP can push the user into a level badge.
 */
export async function evaluateAchievements(userId: string, now = new Date()): Promise<Unlock[]> {
  const ids = await syncCatalog();
  const newly: Unlock[] = [];

  for (let round = 0; round < 3; round++) {
    const [stats, owned] = await Promise.all([
      gatherStats(userId, now),
      prisma.userAchievement.findMany({ where: { userId }, select: { achievement: { select: { key: true } } } }),
    ]);
    const have = new Set(owned.map((o) => o.achievement.key));
    const due = ACHIEVEMENTS.flatMap((def) => {
      if (have.has(def.key)) return [];
      const result = def.check(stats);
      return result ? [{ def, detail: typeof result === "string" ? result : null }] : [];
    });
    if (!due.length) break;

    await prisma.$transaction(async (tx) => {
      let xp = 0;
      for (const { def, detail } of due) {
        const { count } = await tx.userAchievement.createMany({
          data: [{ userId, achievementId: ids.get(def.key)!, detail, unlockedAt: now }],
          skipDuplicates: true, // a concurrent evaluation may have just awarded it
        });
        if (count) {
          xp += def.xpReward;
          newly.push({ key: def.key, name: achievementName(def.key, detail), icon: def.icon, xpReward: def.xpReward });
        }
      }
      if (xp) await awardXp(tx, userId, xp);
    });
  }
  return newly;
}

/** Same as evaluateAchievements, but never throws — for side paths like approvals and page loads. */
export async function evaluateAchievementsSafely(userId: string, now = new Date()) {
  try {
    return await evaluateAchievements(userId, now);
  } catch (err) {
    console.error("Achievement evaluation failed", err);
    return [];
  }
}

/** Every badge with the user's unlock state and progress, for the /achievements page. */
export async function getAchievementBoard(userId: string, now = new Date()) {
  await evaluateAchievementsSafely(userId, now);
  const [stats, unlocks] = await Promise.all([
    gatherStats(userId, now),
    prisma.userAchievement.findMany({
      where: { userId },
      select: { unlockedAt: true, detail: true, achievement: { select: { key: true } } },
    }),
  ]);
  const unlocked = new Map(unlocks.map((u) => [u.achievement.key, u]));
  return {
    stats,
    badges: ACHIEVEMENTS.map((def) => {
      const u = unlocked.get(def.key);
      return {
        key: def.key,
        name: achievementName(def.key, u?.detail),
        description: def.description,
        icon: def.icon,
        category: def.category,
        xpReward: def.xpReward,
        unlockedAt: u?.unlockedAt ?? null,
        progress: def.progress?.(stats) ?? null,
      };
    }),
  };
}
