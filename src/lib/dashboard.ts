import { prisma } from "@/lib/prisma";
import { getLeaderboard } from "@/lib/leaderboard";
import { getPlantingImpact } from "@/lib/impact";
import { resolveCity } from "@/lib/psgc";
import { currentWeeklyPoints } from "@/lib/week";
import { REFERRAL_BONUS_POINTS } from "@/lib/referrals";
import { ecoTipsFor } from "@/data/eco-tips";
import { evaluateAchievementsSafely } from "@/lib/achievements";
import { getPendingCelebrations } from "@/lib/celebrations";
import { getUserMissions } from "@/lib/missions";

const DAY_MS = 86_400_000;
const PLANT_TIERS = [10, 25, 50, 100, 250, 500, 1000];
const REFERRAL_GOAL = 3;
const WEEKLY_POINTS_GOAL = 500;

export type DashboardQuest = {
  id: string;
  /** planting = a claimed slot quest (card shows no bar/badge); milestone = personal goal with a bar. */
  kind: "planting" | "milestone";
  title: string;
  /** Milestones: "X of Y planted"-style text shown by the progress bar. */
  progressLabel?: string;
  detail: string;
  /** Verified / confirmed progress. */
  current: number;
  /** Progress submitted but still awaiting admin review — counted, shown separately (amber). */
  pending?: number;
  target: number;
  /** Slot quests awaiting proof get the Submit Proof modal. */
  uploadQuestId?: string;
  /** Context for the Submit Proof modal's quantity input. */
  proof?: { plantType: string; remaining: number; pointsPerPlant: number };
  status: "todo" | "review" | "done";
  href?: string;
};

/** A finished task for the "Completed" list under Active quests. */
export type CompletedTask = {
  id: string;
  title: string;
  detail: string;
  /** ISO date it was completed; null for milestones without a recorded date. */
  completedAt: string | null;
  kind: "planting" | "milestone";
};

const OPEN_QUEST_LIMIT = 10;
const COMPLETED_LIST_LIMIT = 50;

export type DashboardNotice = {
  id: string;
  kind: "slot" | "reward" | "approved" | "rejected" | "fulfilled" | "declined";
  text: string;
  at: Date;
  href?: string;
};

/** Next milestone above `value`, e.g. 7 → 10, 10 → 25. */
export function nextTier(value: number, tiers = PLANT_TIERS) {
  return tiers.find((t) => t > value) ?? tiers[tiers.length - 1] * Math.ceil((value + 1) / tiers[tiers.length - 1]);
}

export async function getDashboardData(userId: string, now = new Date()) {
  // Leaderboard badges can be earned by other people's activity (e.g. a rival's week resetting),
  // so check on each visit — idempotent, and it never throws.
  await evaluateAchievementsSafely(userId, now);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      points: true,
      xp: true,
      weeklyPoints: true,
      weeklyPointsWeekStart: true,
      totalPlants: true,
      cityCode: true,
      emailVerified: true,
      createdAt: true,
      referralCode: true,
      onboardedAt: true,
      referredBy: { select: { name: true } },
    },
  });
  const place = resolveCity(user.cityCode);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    impact,
    national,
    local,
    openQuests,
    recentCompletions,
    latestApproved,
    pendingCash,
    vouchers,
    cashReceived,
    referrals,
    newSlots,
    newRewards,
    reviewed,
    processedRedemptions,
    uncelebrated,
    ads,
    pendingSubmissions,
    completedQuests,
    completedCount,
  ] = await Promise.all([
    getPlantingImpact(place?.cityCode ?? null),
    getLeaderboard({ scope: "national", viewerId: userId, limit: 1, now }),
    place ? getLeaderboard({ scope: "local", cityCode: place.cityCode, viewerId: userId, limit: 5, now }) : null,
    prisma.quest.findMany({
      where: { userId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
      orderBy: { createdAt: "desc" },
      take: OPEN_QUEST_LIMIT,
      include: {
        slot: { select: { requiredPlantType: true, city: true, pointsPerPlant: true } },
        verifications: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, rejectionReason: true, plantCount: true } },
      },
    }),
    prisma.quest.count({ where: { userId, status: "COMPLETED", completedAt: { gte: monthAgo } } }),
    prisma.verification.findFirst({
      where: { status: "APPROVED", quest: { userId } },
      orderBy: { reviewedAt: "desc" },
      select: {
        mediaUrl: true,
        mediaType: true,
        reviewedAt: true,
        plantCount: true,
        quest: { select: { slot: { select: { requiredPlantType: true, city: true, pointsPerPlant: true } } } },
      },
    }),
    prisma.redemptionHistory.aggregate({
      where: { userId, status: "PENDING", reward: { rewardType: "EWALLET_CASH" } },
      _count: true,
      _sum: { pointsSpent: true },
    }),
    prisma.redemptionHistory.count({ where: { userId, status: "FULFILLED", reward: { rewardType: "VOUCHER" } } }),
    prisma.redemptionHistory.findMany({
      where: { userId, status: "FULFILLED", reward: { rewardType: "EWALLET_CASH" } },
      select: { reward: { select: { valuePesos: true } } },
    }),
    prisma.user.findMany({ where: { referredByUserId: userId }, select: { referralBonusAwardedAt: true } }),
    prisma.slot.findMany({
      where: { status: "OPEN", deletedAt: null, createdAt: { gte: monthAgo }, ...(place ? { cityCode: place.cityCode } : {}) },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, requiredPlantType: true, city: true, pointsPerPlant: true, createdAt: true },
    }),
    prisma.reward.findMany({
      where: { isActive: true, createdAt: { gte: monthAgo } },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { id: true, brand: true, valuePesos: true, rewardType: true, createdAt: true },
    }),
    prisma.verification.findMany({
      where: { quest: { userId }, status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { gte: monthAgo } },
      orderBy: { reviewedAt: "desc" },
      take: 3,
      select: {
        id: true,
        status: true,
        reviewedAt: true,
        rejectionReason: true,
        quest: { select: { pointsAwarded: true, slot: { select: { requiredPlantType: true } } } },
      },
    }),
    prisma.redemptionHistory.findMany({
      where: { userId, status: { in: ["FULFILLED", "REJECTED"] }, processedAt: { gte: monthAgo } },
      orderBy: { processedAt: "desc" },
      take: 2,
      select: { id: true, status: true, processedAt: true, reward: { select: { brand: true, valuePesos: true } } },
    }),
    prisma.quest.findMany({
      where: { userId, status: "COMPLETED", celebratedAt: null },
      orderBy: { completedAt: "asc" },
      select: { id: true, pointsAwarded: true, plantCount: true, slot: { select: { requiredPlantType: true } } },
    }),
    prisma.patronAd.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, companyName: true, imageUrl: true, targetUrl: true },
    }),
    // Every submission awaiting review (not capped), so pending plants/points are fully counted.
    prisma.verification.findMany({
      where: { status: "PENDING", quest: { userId } },
      select: { plantCount: true, quest: { select: { slot: { select: { pointsPerPlant: true } } } } },
    }),
    prisma.quest.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: COMPLETED_LIST_LIMIT,
      select: {
        id: true,
        plantCount: true,
        pointsAwarded: true,
        completedAt: true,
        slot: { select: { requiredPlantType: true, city: true } },
      },
    }),
    prisma.quest.count({ where: { userId, status: "COMPLETED" } }),
  ]);

  const weekly = currentWeeklyPoints(user, now);
  const qualifiedReferrals = referrals.filter((r) => r.referralBonusAwardedAt).length;

  // Submitted proof counts right away (shown as "awaiting review" until an admin approves it).
  const pendingPlants = pendingSubmissions.reduce((sum, v) => sum + v.plantCount, 0);
  const pendingPoints = pendingSubmissions.reduce((sum, v) => sum + v.plantCount * v.quest.slot.pointsPerPlant, 0);

  // ── Active quests: real slot quests first, then personal milestones ──
  // Slot quest progress = approved plants toward the quest's goal; a submission awaiting review
  // is counted at once as the amber part of the bar.
  const allQuests: DashboardQuest[] = openQuests.map((q) => {
    const latest = q.verifications[0];
    const submitted = q.status === "PENDING_VERIFICATION";
    const inReview = submitted && latest?.status === "PENDING" ? latest.plantCount : 0;
    const remaining = Math.max(q.targetPlants - q.plantCount, 1);
    // Points per plant are the admin-assigned slot reward (Slot.pointsPerPlant), read live.
    const pts = `${q.slot.pointsPerPlant} pts per plant`;
    return {
      id: q.id,
      kind: "planting" as const,
      title: `Plant ${q.targetPlants} ${q.slot.requiredPlantType} in ${q.slot.city}`,
      // Fixed format. While proof is under review there's nothing to upload, so it says so.
      detail: submitted ? `${pts} — awaiting review` : `${pts} — upload your proof`,
      current: q.plantCount,
      pending: inReview,
      target: q.targetPlants,
      status: submitted ? "review" : "todo",
      uploadQuestId: q.status === "ACTIVE" ? q.id : undefined,
      proof: { plantType: q.slot.requiredPlantType, remaining, pointsPerPlant: q.slot.pointsPerPlant },
    };
  });
  if (!place) {
    allQuests.push({
      id: "m-city",
      kind: "milestone",
      title: "Set your home city",
      detail: "Unlocks planting slots near you",
      progressLabel: "0 of 1 done",
      current: 0,
      target: 1,
      status: "todo",
      href: "/profile",
    });
  }
  const of = (current: number, target: number, unit: string) =>
    `${current.toLocaleString("en-PH")} of ${target.toLocaleString("en-PH")} ${unit}`;
  // The next tree milestone counts submitted plants too, so a submission moves the bar at once.
  const plantGoal = nextTier(user.totalPlants);
  allQuests.push(
    {
      id: "m-plants",
      kind: "milestone",
      title: `Plant ${plantGoal} trees`,
      progressLabel: of(user.totalPlants, plantGoal, "planted"),
      detail: pendingPlants
        ? `${user.totalPlants} verified + ${pendingPlants} awaiting review`
        : "Lifetime verified plants",
      current: user.totalPlants,
      pending: pendingPlants,
      target: plantGoal,
      status: user.totalPlants >= plantGoal ? "done" : user.totalPlants + pendingPlants >= plantGoal ? "review" : "todo",
    },
    {
      id: "m-referrals",
      kind: "milestone",
      title: `Refer ${REFERRAL_GOAL} friends`,
      progressLabel: of(Math.min(qualifiedReferrals, REFERRAL_GOAL), REFERRAL_GOAL, "friends"),
      detail: `+${REFERRAL_BONUS_POINTS} pts when each friend's first planting is verified`,
      current: Math.min(qualifiedReferrals, REFERRAL_GOAL),
      target: REFERRAL_GOAL,
      status: qualifiedReferrals >= REFERRAL_GOAL ? "done" : "todo",
      href: "/referrals",
    },
    {
      id: "m-weekly",
      kind: "milestone",
      title: `Earn ${WEEKLY_POINTS_GOAL} points this week`,
      progressLabel: of(Math.min(weekly, WEEKLY_POINTS_GOAL), WEEKLY_POINTS_GOAL, "pts"),
      detail: pendingPoints && weekly < WEEKLY_POINTS_GOAL
        ? `${weekly} earned + ${pendingPoints} awaiting review · resets Monday 12:00 AM PHT`
        : "Resets Monday 12:00 AM PHT",
      current: Math.min(weekly, WEEKLY_POINTS_GOAL),
      pending: weekly < WEEKLY_POINTS_GOAL ? pendingPoints : 0,
      target: WEEKLY_POINTS_GOAL,
      status: weekly >= WEEKLY_POINTS_GOAL ? "done" : weekly + pendingPoints >= WEEKLY_POINTS_GOAL ? "review" : "todo",
      href: "/leaderboard",
    },
  );
  // Finished tasks leave the active list; they're listed under "Completed".
  const quests = allQuests.filter((q) => q.status !== "done");

  // ── Completed tasks: every finished planting quest, plus milestones already reached ──
  const reachedTiers = PLANT_TIERS.filter((t) => t <= user.totalPlants);
  const completedTasks: CompletedTask[] = [
    ...completedQuests.map((q) => ({
      id: q.id,
      title: `Planted ${q.plantCount} × ${q.slot.requiredPlantType}`,
      detail: `${q.slot.city} · +${q.pointsAwarded.toLocaleString("en-PH")} pts`,
      completedAt: q.completedAt?.toISOString() ?? null,
      kind: "planting" as const,
    })),
    ...allQuests
      .filter((q) => q.status === "done")
      .map((q) => ({ id: q.id, title: q.title, detail: "Goal reached", completedAt: null, kind: "milestone" as const })),
    ...reachedTiers
      .slice()
      .reverse()
      .map((t) => ({ id: `tier-${t}`, title: `Plant ${t} trees`, detail: "Tree milestone reached", completedAt: null, kind: "milestone" as const })),
  ];

  // ── Account health ──
  const hasRejection = openQuests.some((q) => q.status === "ACTIVE" && q.verifications[0]?.status === "REJECTED");
  const health = [
    { label: "Email verified", ok: !!user.emailVerified },
    { label: "Home city set — geofence active", ok: !!place },
    { label: "Planted in the last 30 days", ok: recentCompletions > 0 },
    { label: "No rejected submissions", ok: !hasRejection },
  ];

  // ── Notifications ──
  const notices: DashboardNotice[] = [
    ...newSlots.map((s) => ({
      id: `slot-${s.id}`,
      kind: "slot" as const,
      text: `New planting slot: ${s.requiredPlantType} in ${s.city} · ${s.pointsPerPlant} pts/plant`,
      at: s.createdAt,
    })),
    ...newRewards.map((r) => ({
      id: `reward-${r.id}`,
      kind: "reward" as const,
      text: `New reward available: ₱${r.valuePesos} ${r.brand} ${r.rewardType === "VOUCHER" ? "voucher" : "cashout"}`,
      at: r.createdAt,
      href: "/rewards",
    })),
    ...reviewed.map((v) => ({
      id: `review-${v.id}`,
      kind: v.status === "APPROVED" ? ("approved" as const) : ("rejected" as const),
      text:
        v.status === "APPROVED"
          ? `Your ${v.quest.slot.requiredPlantType} proof was approved (+${v.quest.pointsAwarded} pts)`
          : `Your ${v.quest.slot.requiredPlantType} proof was rejected${v.rejectionReason ? `: ${v.rejectionReason}` : ""}`,
      at: v.reviewedAt!,
    })),
    ...processedRedemptions.map((r) => ({
      id: `redemption-${r.id}`,
      kind: r.status === "FULFILLED" ? ("fulfilled" as const) : ("declined" as const),
      text:
        r.status === "FULFILLED"
          ? `Your ₱${r.reward.valuePesos} ${r.reward.brand} redemption was fulfilled`
          : `Your ₱${r.reward.valuePesos} ${r.reward.brand} redemption was declined — points refunded`,
      at: r.processedAt!,
      href: "/rewards",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 5);

  return {
    user: {
      name: user.name,
      points: user.points,
      weeklyPoints: weekly,
      xp: user.xp,
      totalPlants: user.totalPlants,
      memberSince: user.createdAt,
      referralCode: user.referralCode,
      onboarded: !!user.onboardedAt,
      invitedBy: user.referredBy ? (user.referredBy.name ?? "a friend") : null,
    },
    place,
    plantGoal,
    impact,
    ranks: {
      national: national.viewer.rank,
      nationalTotal: national.totalRanked,
      local: local?.viewer.rank ?? null,
      localTotal: local?.totalRanked ?? 0,
    },
    health,
    quests,
    completedTasks,
    // Completed planting quests overall (the list shows the latest COMPLETED_LIST_LIMIT) + milestones.
    completedTotal: completedCount + completedTasks.filter((t) => t.kind === "milestone").length,
    latestApproved,
    wallet: {
      points: user.points,
      pendingCashouts: pendingCash._count,
      pendingCashoutPoints: pendingCash._sum.pointsSpent ?? 0,
      vouchersClaimed: vouchers,
      cashReceivedPesos: cashReceived.reduce((sum, r) => sum + r.reward.valuePesos, 0),
    },
    localLeaders: local?.entries ?? [],
    referrals: { invited: referrals.length, qualified: qualifiedReferrals },
    notices,
    ecoTips: ecoTipsFor(place?.regionCode),
    uncelebrated,
    ads,
    celebrations: await getPendingCelebrations(userId, now),
    // Daily quests (reset 00:00 PHT) and side quests, with progress and claim state.
    missions: await getUserMissions(userId, now),
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
