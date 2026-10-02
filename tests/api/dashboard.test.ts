import { beforeEach, describe, expect, it } from "vitest";
import psgc from "@/data/psgc.json";
import { ecoTipsFor } from "@/data/eco-tips";
import { getDashboardData, nextTier } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import { CODES, createSlot, createUser, resetDb } from "../helpers";

beforeEach(resetDb);

describe("nextTier", () => {
  it.each([
    [0, 10],
    [9, 10],
    [10, 25],
    [999, 1000],
    [1000, 2000],
    [2500, 3000],
  ])("%i plants → next goal %i", (plants, goal) => {
    expect(nextTier(plants)).toBe(goal);
  });
});

describe("ecoTipsFor", () => {
  it("has tips for every PSGC region, and general tips otherwise", () => {
    for (const region of psgc.regions) expect(ecoTipsFor(region.code).length, region.code).toBeGreaterThanOrEqual(3);
    expect(ecoTipsFor(null)).toHaveLength(3);
    expect(ecoTipsFor("nope")).toEqual(ecoTipsFor(null));
  });
});

describe("getDashboardData", () => {
  it("assembles quests, health, wallet, leaderboard and notifications for a user", async () => {
    const now = new Date();
    const user = await createUser({
      name: "Rey",
      points: 900,
      totalPlants: 12,
      weeklyPoints: 120,
      weeklyPointsWeekStart: weekStart(now),
    });
    const rival = await createUser({ name: "Ana", weeklyPoints: 300, weeklyPointsWeekStart: weekStart(now) });
    await createUser({ name: "Far away", cityCode: CODES.makati, weeklyPoints: 999, weeklyPointsWeekStart: weekStart(now) });

    const slot = await createSlot({ requiredPlantType: "Narra", pointsPerPlant: 10 });
    const active = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "ACTIVE" } });
    const done = await prisma.quest.create({
      data: { userId: user.id, slotId: slot.id, status: "COMPLETED", plantCount: 3, pointsAwarded: 30, completedAt: now },
    });
    await prisma.verification.create({
      data: {
        questId: done.id,
        mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`,
        mediaType: "image/jpeg",
        plantCount: 3,
        status: "APPROVED",
        reviewedAt: now,
      },
    });

    const gcash = await prisma.reward.create({ data: { rewardType: "EWALLET_CASH", brand: "GCash", costPoints: 500, valuePesos: 50 } });
    const grab = await prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 300, valuePesos: 100 } });
    await prisma.redemptionHistory.createMany({
      data: [
        { userId: user.id, rewardId: gcash.id, pointsSpent: 500, eWalletNumber: "09171234567" },
        { userId: user.id, rewardId: grab.id, pointsSpent: 300, status: "FULFILLED", processedAt: now },
      ],
    });
    await createUser({ referredByUserId: user.id, referralBonusAwardedAt: now });
    await createUser({ referredByUserId: user.id });

    const d = await getDashboardData(user.id, now);

    // Quests: the real slot quest first (with upload), then milestones.
    expect(d.quests[0]).toMatchObject({
      id: active.id,
      title: "Plant 1 Narra in Quezon City",
      detail: "10 pts per plant — upload your proof",
      current: 0,
      target: 1,
      status: "todo",
      uploadQuestId: active.id,
      proof: { plantType: "Narra", remaining: 1, pointsPerPlant: 10 },
    });
    expect(d.quests.find((q) => q.id === "m-plants")).toMatchObject({ current: 12, target: 25 });
    expect(d.quests.find((q) => q.id === "m-referrals")).toMatchObject({ current: 1, target: 3 });
    expect(d.quests.find((q) => q.id === "m-weekly")).toMatchObject({ current: 120, target: 500 });
    expect(d.quests.find((q) => q.id === "m-city")).toBeUndefined();
    // The finished planting quest isn't active; it's in the completed list (with its date), as is the 10-tree milestone.
    expect(d.quests.some((q) => q.id === done.id)).toBe(false);
    expect(d.completedTasks).toEqual([
      expect.objectContaining({ id: done.id, title: "Planted 3 × Narra", kind: "planting", completedAt: now.toISOString() }),
      expect.objectContaining({ id: "tier-10", kind: "milestone" }),
    ]);
    expect(d.completedTotal).toBe(2);

    expect(d.health.every((h) => h.ok)).toBe(true);
    expect(d.latestApproved).toMatchObject({ mediaType: "image/jpeg", plantCount: 3, quest: { slot: { pointsPerPlant: 10 } } });
    expect(d.wallet).toMatchObject({ points: 900, pendingCashouts: 1, pendingCashoutPoints: 500, vouchersClaimed: 1 });

    // Local board = Quezon City only: Ana (300) then Rey (120); Makati user excluded.
    expect(d.localLeaders.map((e) => e.userId)).toEqual([rival.id, user.id]);
    expect(d.ranks).toMatchObject({ local: 2, localTotal: 2, national: 3 });

    expect(d.referrals).toEqual({ invited: 2, qualified: 1 });
    expect(d.notices.map((n) => n.kind).sort()).toEqual(["approved", "fulfilled", "reward", "reward", "slot"]);
    expect(d.place?.city).toBe("Quezon City");
    expect(d.ecoTips).toEqual(ecoTipsFor("130000000"));
  });

  it("guides a brand-new user without a city", async () => {
    const user = await createUser({ cityCode: null, region: null, province: null, city: null });
    const d = await getDashboardData(user.id);

    expect(d.place).toBeNull();
    expect(d.quests[0]).toMatchObject({ id: "m-city", href: "/profile" });
    expect(d.health.find((h) => h.label.startsWith("Home city"))?.ok).toBe(false);
    expect(d.localLeaders).toEqual([]);
    expect(d.latestApproved).toBeNull();
    expect(d.ranks).toMatchObject({ national: null, local: null });
  });

  it("counts submitted proof right away: quest progress, plants and points awaiting review", async () => {
    const now = new Date();
    const user = await createUser({ totalPlants: 8, weeklyPoints: 100, weeklyPointsWeekStart: weekStart(now) });
    const slot = await createSlot({ requiredPlantType: "Narra", pointsPerPlant: 50, questGoal: 6 });
    // 1 plant already approved toward a goal of 6; a batch of 4 awaiting review.
    const submitted = await prisma.quest.create({
      data: { userId: user.id, slotId: slot.id, status: "PENDING_VERIFICATION", plantCount: 1, targetPlants: 6 },
    });
    await prisma.verification.create({
      data: { questId: submitted.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount: 4 },
    });

    const d = await getDashboardData(user.id, now);
    expect(d.quests.find((q) => q.id === submitted.id)).toMatchObject({
      title: "Plant 6 Narra in Quezon City",
      detail: "50 pts per plant — awaiting review",
      current: 1,
      pending: 4,
      target: 6,
      status: "review",
      uploadQuestId: undefined,
    });
    // 8 verified + 4 submitted reach the 10-tree goal (pending review); 100 + 4×50 points pending.
    expect(d.quests.find((q) => q.id === "m-plants")).toMatchObject({ current: 8, pending: 4, target: 10, status: "review" });
    expect(d.quests.find((q) => q.id === "m-plants")?.detail).toBe("8 verified + 4 awaiting review");
    expect(d.quests.find((q) => q.id === "m-weekly")).toMatchObject({ current: 100, pending: 200, target: 500, status: "todo" });
  });

  it("hides finished goals from the active list and lists them as completed", async () => {
    const now = new Date();
    const user = await createUser({ totalPlants: 30, weeklyPoints: 600, weeklyPointsWeekStart: weekStart(now) });
    const d = await getDashboardData(user.id, now);

    expect(d.quests.some((q) => q.id === "m-weekly")).toBe(false); // 600 ≥ 500: done → hidden
    expect(d.quests.find((q) => q.id === "m-plants")).toMatchObject({ target: 50 });
    expect(d.completedTasks.map((t) => t.id)).toEqual(["m-weekly", "tier-25", "tier-10"]);
    expect(d.completedTotal).toBe(3);
  });

  it("flags a rejected submission as needing attention", async () => {
    const user = await createUser();
    const slot = await createSlot();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "ACTIVE" } });
    await prisma.verification.create({
      data: {
        questId: quest.id,
        mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`,
        mediaType: "image/jpeg",
        status: "REJECTED",
        rejectionReason: "Blurry",
        reviewedAt: new Date(),
      },
    });

    const d = await getDashboardData(user.id);
    // The subtitle keeps its fixed format; the reason reaches the planter as a notification.
    expect(d.quests[0].detail).toBe("10 pts per plant — upload your proof");
    expect(d.health.find((h) => h.label === "No rejected submissions")?.ok).toBe(false);
    expect(d.notices[0]).toMatchObject({ kind: "rejected" });
  });
});

describe("planting quest subtitle", () => {
  it("uses the slot's admin-assigned points per plant, read live", async () => {
    const user = await createUser();
    const slot = await createSlot({ requiredPlantType: "Molave", pointsPerPlant: 51, questGoal: 3 });
    const q = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, targetPlants: 3 } });
    let d = await getDashboardData(user.id);
    expect(d.quests.find((x) => x.id === q.id)).toMatchObject({
      title: "Plant 3 Molave in Quezon City",
      detail: "51 pts per plant — upload your proof",
    });

    await prisma.slot.update({ where: { id: slot.id }, data: { pointsPerPlant: 75 } });
    d = await getDashboardData(user.id);
    expect(d.quests.find((x) => x.id === q.id)?.detail).toBe("75 pts per plant — upload your proof");
  });
});

describe("planting tab rows", () => {
  it("marks slot quests as planting cards and gives milestones 'X of Y' labels", async () => {
    const now = new Date();
    const user = await createUser({ totalPlants: 12, weeklyPoints: 120, weeklyPointsWeekStart: weekStart(now) });
    const q = await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id } });
    const d = await getDashboardData(user.id, now);

    expect(d.quests.find((x) => x.id === q.id)).toMatchObject({ kind: "planting" });
    expect(d.quests.find((x) => x.id === q.id)?.progressLabel).toBeUndefined();
    expect(d.quests.find((x) => x.id === "m-plants")).toMatchObject({ kind: "milestone", progressLabel: "12 of 25 planted" });
    expect(d.quests.find((x) => x.id === "m-referrals")).toMatchObject({ kind: "milestone", progressLabel: "0 of 3 friends" });
    expect(d.quests.find((x) => x.id === "m-weekly")).toMatchObject({ kind: "milestone", progressLabel: "120 of 500 pts" });
  });
});
