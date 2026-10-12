import { prisma } from "@/lib/prisma";
import { claimNotExpired } from "@/lib/quests";
import { getUserMissions } from "@/lib/missions";
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
    };

/** A card to show, or why there isn't one (said to the planter, with links to help). */
export type ActionOutcome = { action: AssistantAction } | { error: string; links?: AssistantLink[] };

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

/** A slot in the planter's home city that they can claim now. */
export async function claimSlotAction(userId: string, slotId: string, now = new Date()): Promise<ActionOutcome> {
  const found = await homeCitySlots(userId, now);
  if (!found) return { error: "Set your home city first — you can only claim slots in your own city.", links: [{ label: "Set Home City", href: "/profile" }] };
  const slot = found.slots.find((s) => s.id === slotId);
  const map = [{ label: "Open Slot Map", href: "/dashboard" }];
  if (!slot) return { error: "I couldn't find that slot in your city. Type /slots to see the open ones.", links: map };
  if (slot.youClaimedIt) return { error: "You already claimed this slot. Upload your proof once you've planted.", links: map };
  if (slot.yourClaimExpired) return { error: "Your claim on this slot ran out, so it can't be claimed again.", links: map };
  if (!slot.available) return { error: "This slot is full or closed now.", links: map };
  return {
    action: {
      kind: "claim_slot",
      slotId: slot.id,
      plant: slot.plant,
      barangay: slot.barangay,
      pointsPerPlant: slot.pointsPerPlant,
      plantsPerQuest: slot.plantsPerQuest,
      spotsLeft: slot.spotsLeft,
    },
  };
}

/** A daily or side quest whose reward is ready to claim. */
export async function claimMissionAction(userId: string, missionId: string, now = new Date()): Promise<ActionOutcome> {
  const { daily, side } = await getUserMissions(userId, now);
  const mission = [...daily, ...side].find((m) => m.id === missionId);
  const links = [{ label: "Open Dashboard", href: "/dashboard" }];
  if (!mission) return { error: "I couldn't find that quest. Type /missions to see today's.", links };
  if (mission.status === "claimed") return { error: `You already claimed the reward for "${mission.title}".`, links };
  if (mission.status !== "ready") return { error: `"${mission.title}" isn't done yet (${Math.min(mission.progress, mission.target)}/${mission.target}).`, links };
  return { action: { kind: "claim_mission", missionId: mission.id, title: mission.title, points: mission.rewardPoints, xp: mission.rewardXp } };
}

/** An active reward the planter can afford. */
export async function redeemAction(userId: string, rewardId: string): Promise<ActionOutcome> {
  const [reward, user, last] = await Promise.all([
    prisma.reward.findFirst({ where: { id: rewardId, isActive: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { points: true } }),
    prisma.redemptionHistory.findFirst({ where: { userId, eWalletNumber: { not: null } }, orderBy: { createdAt: "desc" }, select: { eWalletNumber: true } }),
  ]);
  const links = [{ label: "Open Rewards", href: "/rewards" }];
  if (!reward || !user) return { error: "I couldn't find that reward. Type /rewards to see what's available.", links };
  if (user.points < reward.costPoints) {
    return { error: `You need ${(reward.costPoints - user.points).toLocaleString("en-PH")} more pts for that reward.`, links };
  }
  return {
    action: {
      kind: "redeem_reward",
      rewardId: reward.id,
      brand: reward.brand,
      valuePesos: reward.valuePesos,
      costPoints: reward.costPoints,
      isCash: reward.rewardType === "EWALLET_CASH",
      balance: user.points,
      lastNumber: last?.eWalletNumber ?? null,
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
};
