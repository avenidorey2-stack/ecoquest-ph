import { prisma } from "@/lib/prisma";
import { claimNotExpired } from "@/lib/quests";
import { getUserMissions } from "@/lib/missions";
import { MAX_ORDER_QUANTITY } from "@/lib/seedlings";
import { ORDER_COOLDOWN_SECONDS } from "@/lib/delivery";
import { homeCitySlots } from "./data";
import type { AssistantLink } from "./commands";

// Things EcoBot can help the planter do. EcoBot never does them itself: it hands the chat an
// action card built here from the planter's own live records, and the planter confirms on the
// card, which calls the same API route the rest of the app uses (with all its checks). So the
// AI can't act on anything the planter can't, or without them tapping.

export type ProofQuest = { questId: string; plant: string; place: string; remaining: number; pointsPerPlant: number };

export type AssistantAction =
  | { kind: "upload_proof"; quests: ProofQuest[] }
  | { kind: "claim_slot"; slotId: string; plant: string; barangay: string | null; pointsPerPlant: number; plantsPerQuest: number; spotsLeft: number }
  | { kind: "claim_mission"; missionId: string; title: string; points: number; xp: number }
  | {
      kind: "redeem_reward";
      rewardId: string;
      brand: string;
      valuePesos: number;
      costPoints: number;
      isCash: boolean;
      balance: number;
      /** Prefill for e-wallet cashouts: the number used on the planter's last cashout. */
      lastNumber: string | null;
    }
  | {
      kind: "order_seedlings";
      product: { id: string; name: string; priceInPoints: number; priceInPesos: number; stockQuantity: number };
      balance: number;
      maxQuantity: number;
      /** The planter's last delivery details, to pre-fill the form (as on the Shop page). */
      deliveryDefaults: Record<string, string | null>;
      cooldownUntil: number;
      quantity: number;
      currency: "POINTS" | "PESOS";
    }
  // People (src/lib/assistant/actions-people.ts)
  | ({ kind: "send_message"; text: string } & PersonRef)
  | ({ kind: "add_friend"; accept: boolean } & PersonRef)
  | ({ kind: "remove_friend"; state: "FRIENDS" | "REQUESTED" | "INCOMING" } & PersonRef)
  | ({ kind: "block_user"; block: boolean } & PersonRef)
  | ({ kind: "report_user"; reason: string | null; details: string; reasons: { value: string; label: string }[] } & PersonRef)
  | ({ kind: "like_photo"; liked: boolean } & PhotoRef)
  | ({ kind: "comment_photo"; text: string } & PhotoRef)
  // Account (src/lib/assistant/actions-account.ts)
  | { kind: "change_name"; current: string; name: string }
  | { kind: "change_city"; cityCode: string; city: string; province: string; current: string | null }
  | { kind: "profile_photo"; remove: boolean; current: string | null }
  | { kind: "update_settings"; changes: SettingChange[] }
  | { kind: "invite_code"; code: string; referrerName: string }
  | { kind: "report_problem"; subject: string; message: string }
  | { kind: "read_notifications"; unread: number }
  /** Several actions of the same sort the planter allows at once ("claim all slots", "message all my friends"). */
  | { kind: "batch"; items: BatchItem[] };

/** Actions that can be allowed together in one batch card. */
export type BatchItem = Extract<
  AssistantAction,
  { kind: "claim_slot" | "claim_mission" | "redeem_reward" | "send_message" | "add_friend" | "remove_friend" | "block_user" | "like_photo" | "comment_photo" }
>;

/** Another planter an action is about. */
export type PersonRef = { userId: string; name: string; image: string | null; city: string | null };
/** A planter's approved planting photo. */
export type PhotoRef = { photoId: string; ownerId: string; ownerName: string; mediaUrl: string; isVideo: boolean };
/** One setting to change: the field PATCH /api/settings takes, its new value, and how to say it. */
export type SettingChange = { field: string; value: string | boolean; label: string };

/** A card to show, or why there isn't one (said to the planter, with links to help). `choices` lists who/what they might mean. */
export type ActionOutcome =
  | { action: AssistantAction; skipped?: string[] }
  | { error: string; links?: AssistantLink[]; choices?: unknown[] };

/** The planter's quests that are waiting for proof; narrowed to one when `questId` is given. */
export async function proofAction(userId: string, questId?: string, now = new Date()): Promise<ActionOutcome> {
  const rows = await prisma.quest.findMany({
    where: { userId, status: "ACTIVE", ...claimNotExpired(now), slot: { status: { not: "CLOSED" }, deletedAt: null } },
    include: { slot: { select: { requiredPlantType: true, barangay: true, city: true, pointsPerPlant: true } } },
    orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  });
  const quests = rows
    .filter((q) => !questId || q.id === questId)
    .map((q) => ({
      questId: q.id,
      plant: q.slot.requiredPlantType,
      place: [q.slot.barangay, q.slot.city].filter(Boolean).join(", "),
      remaining: Math.max(1, q.targetPlants - q.plantCount),
      pointsPerPlant: q.slot.pointsPerPlant,
    }));
  if (quests.length) return { action: { kind: "upload_proof", quests } };

  if (questId && rows.length) return { error: "That quest isn't waiting for proof. Pick one of your active quests.", links: [{ label: "Open Dashboard", href: "/dashboard" }] };
  const reviewing = await prisma.quest.count({ where: { userId, status: "PENDING_VERIFICATION" } });
  return reviewing
    ? { error: "Your proof is already being reviewed. You can send more once an admin checks it.", links: [{ label: "Open Dashboard", href: "/dashboard" }] }
    : { error: "You have no quest waiting for proof. Claim a slot first — type /slots to see open ones.", links: [{ label: "Open Slot Map", href: "/dashboard" }] };
}

/** Most items one "allow all" card may hold. Messages, requests and comments have their own lower caps (their routes' rate limits). */
export const BATCH_MAX = 50;

/**
 * One card per action; two or more become a single "allow all" card the planter approves at once
 * (they can untick items first). `skipped` says what was left out and why, for the AI to tell them.
 */
export function bundle(items: BatchItem[], skipped: string[], empty: string, links: AssistantLink[], cap = BATCH_MAX): ActionOutcome {
  const extra = items.length - cap;
  const kept = items.slice(0, cap);
  if (extra > 0) skipped = [...skipped, `${extra} more left out: at most ${cap} at a time. Ask again after these.`];
  if (!kept.length) return { error: skipped.length ? skipped.join(" ") : empty, links };
  return { action: kept.length === 1 ? kept[0] : { kind: "batch", items: kept }, ...(skipped.length ? { skipped } : {}) };
}

/** Slots in the planter's home city they can claim now: the ones named, or every claimable one ("all"). */
export async function claimSlotAction(userId: string, slotIds: string[] | "all", now = new Date()): Promise<ActionOutcome> {
  const found = await homeCitySlots(userId, now);
  if (!found) return { error: "Set your home city first — you can only claim slots in your own city.", links: [{ label: "Set Home City", href: "/profile" }] };
  const map = [{ label: "Open Slot Map", href: "/dashboard" }];
  const claimable = (s: (typeof found.slots)[number]) => s.available && !s.youClaimedIt && !s.yourClaimExpired;
  const skipped: string[] = [];
  let picked: typeof found.slots;
  if (slotIds === "all") {
    picked = found.slots.filter(claimable);
  } else {
    picked = [];
    for (const id of new Set(slotIds)) {
      const slot = found.slots.find((s) => s.id === id);
      const name = slot ? `${slot.plant}${slot.barangay ? ` (${slot.barangay})` : ""}` : "";
      if (!slot) skipped.push("A slot isn't in your city or is no longer open.");
      else if (slot.youClaimedIt) skipped.push(`${name}: you already claimed it.`);
      else if (slot.yourClaimExpired) skipped.push(`${name}: your claim ran out, so it can't be claimed again.`);
      else if (!slot.available) skipped.push(`${name}: full or closed.`);
      else picked.push(slot);
    }
  }
  const cards = picked.map(
    (slot): BatchItem => ({
      kind: "claim_slot",
      slotId: slot.id,
      plant: slot.plant,
      barangay: slot.barangay,
      pointsPerPlant: slot.pointsPerPlant,
      plantsPerQuest: slot.plantsPerQuest,
      spotsLeft: slot.spotsLeft,
    }),
  );
  return bundle(cards, skipped, slotIds === "all" ? `No open slots you can claim in ${found.city} right now.` : "None of those slots can be claimed.", map);
}

/** Daily or side quests whose reward is ready: the ones named, or all of them ("all"). */
export async function claimMissionAction(userId: string, missionIds: string[] | "all", now = new Date()): Promise<ActionOutcome> {
  const { daily, side } = await getUserMissions(userId, now);
  const all = [...daily, ...side];
  const links = [{ label: "Open Dashboard", href: "/dashboard" }];
  const skipped: string[] = [];
  let ready: typeof all;
  if (missionIds === "all") {
    ready = all.filter((m) => m.status === "ready");
  } else {
    ready = [];
    for (const id of new Set(missionIds)) {
      const mission = all.find((m) => m.id === id);
      if (!mission) skipped.push("A quest wasn't found. Type /missions to see today's.");
      else if (mission.status === "claimed") skipped.push(`You already claimed the reward for "${mission.title}".`);
      else if (mission.status !== "ready") skipped.push(`"${mission.title}" isn't done yet (${Math.min(mission.progress, mission.target)}/${mission.target}).`);
      else ready.push(mission);
    }
  }
  const cards = ready.map((m): BatchItem => ({ kind: "claim_mission", missionId: m.id, title: m.title, points: m.rewardPoints, xp: m.rewardXp }));
  return bundle(cards, skipped, missionIds === "all" ? "No quest rewards are ready to claim right now." : "No reward to claim.", links);
}

/** Active rewards the planter can afford, in order; the same reward may be listed more than once. */
export async function redeemAction(userId: string, rewardIds: string[]): Promise<ActionOutcome> {
  const [rewards, user, last] = await Promise.all([
    prisma.reward.findMany({ where: { id: { in: [...new Set(rewardIds)] }, isActive: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
    prisma.redemptionHistory.findFirst({ where: { userId, eWalletNumber: { not: null } }, orderBy: { createdAt: "desc" }, select: { eWalletNumber: true } }),
  ]);
  const links = [{ label: "Open Rewards", href: "/rewards" }];
  if (!user) return { error: "I couldn't find your account.", links };
  const skipped: string[] = [];
  const cards: BatchItem[] = [];
  let left = user.points;
  for (const id of rewardIds.slice(0, BATCH_MAX)) {
    const reward = rewards.find((r) => r.id === id);
    if (!reward) {
      skipped.push("A reward wasn't found. Type /rewards to see what's available.");
      continue;
    }
    if (left < reward.costPoints) {
      skipped.push(`${reward.brand} ₱${reward.valuePesos}: you need ${(reward.costPoints - left).toLocaleString("en-PH")} more pts.`);
      continue;
    }
    left -= reward.costPoints;
    cards.push({
      kind: "redeem_reward",
      rewardId: reward.id,
      brand: reward.brand,
      valuePesos: reward.valuePesos,
      costPoints: reward.costPoints,
      isCash: reward.rewardType === "EWALLET_CASH",
      balance: user.points,
      lastNumber: last?.eWalletNumber ?? null,
    });
  }
  return bundle(cards, skipped, "Nothing to redeem.", links);
}

/** A seedling from the shop, with the order form pre-filled (quantity, how to pay, last delivery address). */
export async function orderAction(userId: string, tree: string, quantity?: number, currency?: string): Promise<ActionOutcome> {
  const q = tree.trim();
  const links = [{ label: "Open Shop", href: "/shop" }];
  if (!q) return { error: "Which seedling? Type /prices to see the shop.", links };
  const rows = await prisma.seedlingProduct.findMany({
    where: { isActive: true, species: { OR: [{ name: { contains: q, mode: "insensitive" } }, { scientificName: { contains: q, mode: "insensitive" } }] } },
    include: { species: { select: { name: true } } },
    take: 10,
  });
  // "Narra" picks Narra even if another seedling's name contains it.
  const exact = rows.filter((r) => r.species.name.toLowerCase() === q.toLowerCase());
  const matches = exact.length ? exact : rows;
  if (!matches.length) return { error: `The shop has no seedling called "${q}". Type /prices to see what's for sale.`, links };
  if (matches.length > 1) return { error: "More than one seedling matches. Ask which one.", choices: matches.map((m) => m.species.name), links };
  const p = matches[0];
  if (p.stockQuantity < 1) return { error: `${p.species.name} is sold out right now.`, links };

  const [user, lastDelivery, lastOrder] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { points: true, name: true, city: true, province: true } }),
    prisma.orderDelivery.findFirst({
      where: { order: { userId } },
      orderBy: { createdAt: "desc" },
      select: { recipientName: true, contactNumber: true, streetAddress: true, barangay: true, cityProvince: true, landmark: true, instructions: true },
    }),
    prisma.order.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const limit = Math.min(MAX_ORDER_QUANTITY, p.stockQuantity);
  const wanted = Number.isInteger(quantity) ? Math.min(Math.max(quantity!, 1), limit) : 1;
  return {
    action: {
      kind: "order_seedlings",
      product: { id: p.id, name: p.species.name, priceInPoints: p.priceInPoints, priceInPesos: p.priceInPesos, stockQuantity: p.stockQuantity },
      balance: user.points,
      maxQuantity: MAX_ORDER_QUANTITY,
      deliveryDefaults: lastDelivery ?? { recipientName: user.name ?? "", cityProvince: [user.city, user.province].filter(Boolean).join(", ") },
      cooldownUntil: lastOrder ? lastOrder.createdAt.getTime() + ORDER_COOLDOWN_SECONDS * 1000 : 0,
      quantity: wanted,
      currency: currency === "PESOS" && p.priceInPesos > 0 ? "PESOS" : "POINTS",
    },
  };
}

/** Pages EcoBot can send the planter to, for things done on a page rather than in the chat. */
export const APP_PAGES: Record<string, AssistantLink> = {
  dashboard: { label: "Open Dashboard", href: "/dashboard" },
  map: { label: "Open Slot Map", href: "/dashboard" },
  shop: { label: "Open Shop", href: "/shop" },
  rewards: { label: "Open Rewards", href: "/rewards" },
  profile: { label: "Open Profile", href: "/profile" },
  settings: { label: "Open Settings", href: "/settings" },
  leaderboard: { label: "Open Leaderboard", href: "/leaderboard" },
  friends: { label: "Open Friends", href: "/friends" },
  messages: { label: "Open Messages", href: "/messages" },
  trees: { label: "Open Tree Directory", href: "/trees" },
  transactions: { label: "Open Transactions", href: "/transactions" },
  referrals: { label: "Open Referrals", href: "/referrals" },
  achievements: { label: "Open Achievements", href: "/achievements" },
  password: { label: "Change Password", href: "/settings" },
  delete_account: { label: "Open Settings", href: "/settings" },
  notifications: { label: "Open Settings", href: "/settings" },
  support: { label: "Open Help & Support", href: "/settings/support" },
};
