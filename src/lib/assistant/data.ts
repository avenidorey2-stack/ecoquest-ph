import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";
import { holdsSpot, isClaimExpired } from "@/lib/quests";
import { levelProgress } from "@/lib/levels";
import { getUserMissions } from "@/lib/missions";
import { getLeaderboard } from "@/lib/leaderboard";
import { TREE_CATEGORY_ORDER } from "@/data/tree-species";

// Read-only lookups behind the assistant's slash commands and its AI tools, so both always
// report the same live numbers. Everything here is either public catalogue data or the
// asking planter's own records — never another planter's.

const ACTIVE_QUEST_STATUSES = ["ACTIVE", "PENDING_VERIFICATION"] as const;
/** Lists stay short enough to read in a chat bubble. */
const LIST_LIMIT = 10;

/**
 * Every live slot in the planter's home city (the only ones they can claim — geofence), best
 * paying first, or null without a home city.
 */
export async function homeCitySlots(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { cityCode: true } });
  const place = resolveCity(user?.cityCode ?? null);
  if (!place) return null;

  const rows = await prisma.slot.findMany({
    where: { deletedAt: null, cityCode: place.cityCode, status: { in: ["OPEN", "FULL"] } },
    include: {
      _count: { select: { quests: { where: holdsSpot(now) } } },
      quests: { where: { userId, status: { in: [...ACTIVE_QUEST_STATUSES] } }, select: { expiresAt: true } },
    },
    orderBy: [{ pointsPerPlant: "desc" }, { createdAt: "desc" }],
  });

  const slots = rows.map((s) => {
    const spotsLeft = Math.max(0, s.maxParticipants - s._count.quests);
    const mine = s.quests.find((q) => !isClaimExpired(q, now));
    return {
      id: s.id,
      plant: s.requiredPlantType,
      barangay: s.barangay,
      pointsPerPlant: s.pointsPerPlant,
      plantsPerQuest: s.questGoal,
      spotsLeft,
      maxParticipants: s.maxParticipants,
      youClaimedIt: !!mine,
      // Their claim here ran out: they can't claim this slot again unless an admin extends it.
      yourClaimExpired: !mine && s.quests.length > 0,
      available: s.status === "OPEN" && spotsLeft > 0,
    };
  });
  return { city: `${place.city}, ${place.province}`, slots };
}

/** Slots in the planter's home city they can claim (or already claimed), for listing. */
export async function openSlotsNearMe(userId: string, now = new Date()) {
  const found = await homeCitySlots(userId, now);
  if (!found) return { city: null, slots: [], available: 0, full: 0 };
  const { city, slots } = found;
  return {
    city,
    slots: slots.filter((s) => (s.available && !s.yourClaimExpired) || s.youClaimedIt).slice(0, LIST_LIMIT),
    // Total open-and-claimable, which can exceed what's listed.
    available: slots.filter((s) => s.available && !s.youClaimedIt && !s.yourClaimExpired).length,
    full: slots.filter((s) => !s.available).length,
  };
}

/** Seedling shop prices, optionally narrowed to species whose name matches `query`. */
export async function seedlingPrices(query?: string) {
  const q = query?.trim();
  const rows = await prisma.seedlingProduct.findMany({
    where: {
      isActive: true,
      ...(q
        ? { species: { OR: [{ name: { contains: q, mode: "insensitive" } }, { scientificName: { contains: q, mode: "insensitive" } }] } }
        : {}),
    },
    include: { species: { select: { name: true, category: true, sortOrder: true } } },
  });
  const order = (c: string) => {
    const i = (TREE_CATEGORY_ORDER as readonly string[]).indexOf(c);
    return i === -1 ? TREE_CATEGORY_ORDER.length : i;
  };
  return rows
    .sort((a, b) => order(a.species.category) - order(b.species.category) || a.species.sortOrder - b.species.sortOrder)
    .map((p) => ({
      name: p.species.name,
      category: p.species.category,
      points: p.priceInPoints,
      // null = can only be bought with points.
      pesos: p.priceInPesos > 0 ? p.priceInPesos : null,
      inStock: p.stockQuantity,
    }));
}

/** Active rewards: e-wallet cash and vouchers, cheapest first. */
export async function rewardList() {
  const rows = await prisma.reward.findMany({ where: { isActive: true }, orderBy: [{ costPoints: "asc" }, { brand: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    type: r.rewardType === "EWALLET_CASH" ? "e-wallet cash" : "voucher",
    valuePesos: r.valuePesos,
    costPoints: r.costPoints,
  }));
}

/** The planter's balance, level and standing this week. */
export async function myStats(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { points: true, xp: true, totalPlants: true, cityCode: true },
  });
  if (!user) return null;
  const place = resolveCity(user.cityCode);
  const [national, local] = await Promise.all([
    getLeaderboard({ scope: "national", viewerId: userId, limit: 1, now }),
    place ? getLeaderboard({ scope: "local", cityCode: place.cityCode, viewerId: userId, limit: 1, now }) : null,
  ]);
  const level = levelProgress(user.xp);
  return {
    points: user.points,
    xp: user.xp,
    level: level.level,
    levelTitle: level.title,
    xpToNextLevel: level.xpToNext,
    approvedPlants: user.totalPlants,
    homeCity: place ? `${place.city}, ${place.province}` : null,
    weeklyPoints: national.viewer.weeklyPoints,
    nationalRank: national.viewer.rank,
    localRank: local?.viewer.rank ?? null,
  };
}

/** The planter's current claims (active or awaiting review), soonest deadline first. */
export async function myQuests(userId: string, now = new Date()) {
  const quests = await prisma.quest.findMany({
    where: { userId, status: { in: [...ACTIVE_QUEST_STATUSES] } },
    include: { slot: { select: { requiredPlantType: true, barangay: true, city: true, pointsPerPlant: true } } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return quests.slice(0, LIST_LIMIT).map((q) => ({
    id: q.id,
    plant: q.slot.requiredPlantType,
    place: [q.slot.barangay, q.slot.city].filter(Boolean).join(", "),
    status: q.status === "PENDING_VERIFICATION" ? "proof under review" : isClaimExpired(q, now) ? "claim expired" : "active",
    progress: `${q.plantCount}/${q.targetPlants} plants approved`,
    pointsPerPlant: q.slot.pointsPerPlant,
    expiresAt: q.expiresAt,
  }));
}

/** Today's daily quests and the live side quests, with progress. */
export async function myMissions(userId: string, now = new Date()) {
  const { daily, side, dailyResetsAt } = await getUserMissions(userId, now);
  const view = (m: (typeof daily)[number]) => ({
    id: m.id,
    title: m.title,
    progress: `${Math.min(m.progress, m.target)}/${m.target}`,
    reward: { points: m.rewardPoints, xp: m.rewardXp },
    status: m.status === "claimed" ? "reward claimed" : m.status === "ready" ? "done, reward ready to claim" : "in progress",
    endsAt: m.endsAt,
  });
  return { daily: daily.map(view), side: side.map(view), dailyResetsAt };
}

/** The planter's latest seedling orders. */
export async function myOrders(userId: string) {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { product: { select: { species: { select: { name: true } } } } },
  });
  return orders.map((o) => ({
    seedling: o.product.species.name,
    quantity: o.quantity,
    total: o.totalPrice,
    currency: o.currencyUsed,
    status: o.status,
    orderedAt: o.createdAt,
  }));
}

/**
 * Tree directory lookup by common or scientific name. No query returns every species with its
 * description, so questions like "which is the smallest?" can be answered from the directory.
 */
export async function findTrees(query?: string) {
  const q = query?.trim();
  if (!q) {
    const all = await prisma.treeSpecies.findMany({
      select: { name: true, scientificName: true, category: true, description: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    return { matches: [], all };
  }
  const matches = await prisma.treeSpecies.findMany({
    where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { scientificName: { contains: q, mode: "insensitive" } }, { slug: { contains: q.toLowerCase().replace(/\s+/g, "-") } }] },
    orderBy: { sortOrder: "asc" },
    take: 3,
    select: { name: true, scientificName: true, category: true, description: true, benefits: true, totalPlanted: true, plantingGoal: true },
  });
  return { matches, all: [] };
}
