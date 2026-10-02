import type { MissionKind, MissionObjective } from "@/generated/prisma/enums";

// Display metadata for daily/side quest objectives (client-safe: no server imports).

export const MISSION_OBJECTIVES: Record<
  MissionObjective,
  { label: string; unit: string; href: string; action: string; describe: (n: number) => string }
> = {
  PLANT_TREES: {
    label: "Plant trees (approved)",
    unit: "planted",
    href: "/dashboard",
    action: "Plant",
    describe: (n) => `Get ${n} plant${n === 1 ? "" : "s"} approved`,
  },
  SUBMIT_PROOF: {
    label: "Submit planting proof",
    unit: "submitted",
    href: "/dashboard",
    action: "Submit",
    describe: (n) => `Submit ${n} planting proof${n === 1 ? "" : "s"}`,
  },
  BUY_SEEDLINGS: {
    label: "Buy seedlings from the shop",
    unit: "bought",
    href: "/shop",
    action: "Shop",
    describe: (n) => `Buy ${n} seedling${n === 1 ? "" : "s"} from the shop`,
  },
  INVITE_FRIENDS: {
    label: "Invite friends (sign-ups)",
    unit: "joined",
    href: "/referrals",
    action: "Invite",
    describe: (n) => `Invite ${n} friend${n === 1 ? "" : "s"} who sign up`,
  },
  REDEEM_REWARD: {
    label: "Redeem rewards",
    unit: "redeemed",
    href: "/rewards",
    action: "Redeem",
    describe: (n) => `Redeem ${n} reward${n === 1 ? "" : "s"}`,
  },
};

export const MISSION_KIND_LABELS: Record<MissionKind, string> = { DAILY: "Daily quest", SIDE: "Side quest" };

export const MAX_MISSION_TARGET = 1_000;
export const MAX_MISSION_POINTS = 100_000;
export const MAX_MISSION_XP = 10_000;
