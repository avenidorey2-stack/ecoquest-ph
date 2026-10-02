import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimRoute } from "@/app/api/missions/[id]/claim/route";
import { POST as createMissionRoute } from "@/app/api/admin/missions/route";
import { DELETE as deleteMissionRoute, PATCH as updateMissionRoute } from "@/app/api/admin/missions/[id]/route";
import { prisma } from "@/lib/prisma";
import { claimMission, closeMission, getUserMissions, MissionError, parseMission, seedStarterMissions } from "@/lib/missions";
import { dayStart, manilaDateKey, nextDayStart } from "@/lib/week";
import { syncTreeSpecies } from "@/lib/species";
import { seedSeedlingProducts } from "@/lib/seedlings";
import type { Prisma } from "@/generated/prisma/client";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

// 2026-10-03 10:00 PHT = 02:00 UTC
const NOW = new Date("2026-10-03T02:00:00Z");
const YESTERDAY = new Date("2026-10-02T05:00:00Z"); // Oct 2, 13:00 PHT
const TOMORROW = new Date("2026-10-04T02:00:00Z");

const mission = (data: Partial<Prisma.MissionUncheckedCreateInput> = {}) =>
  prisma.mission.create({
    data: {
      kind: "DAILY",
      title: "Daily proof",
      objective: "SUBMIT_PROOF",
      target: 1,
      rewardPoints: 20,
      rewardXp: 10,
      startsAt: new Date("2026-01-01T00:00:00Z"),
      ...data,
    },
  });

async function proofAt(userId: string, at: Date, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  const quest = await prisma.quest.create({ data: { userId, slotId: (await createSlot()).id } });
  return prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount: 1, status, createdAt: at },
  });
}

describe("Philippine day boundaries", () => {
  it("daily quests reset at 00:00 PHT (16:00 UTC)", () => {
    expect(dayStart(NOW).toISOString()).toBe("2026-10-02T16:00:00.000Z");
    expect(nextDayStart(NOW).toISOString()).toBe("2026-10-03T16:00:00.000Z");
    expect(manilaDateKey(NOW)).toBe("2026-10-03");
    expect(manilaDateKey(new Date("2026-10-03T15:59:59Z"))).toBe("2026-10-03"); // 23:59:59 PHT
    expect(manilaDateKey(new Date("2026-10-03T16:00:00Z"))).toBe("2026-10-04"); // midnight PHT
  });
});

describe("parseMission", () => {
  const ok = { kind: "SIDE", title: "Stock up", objective: "BUY_SEEDLINGS", target: 5, rewardPoints: 100 };
  it("accepts a complete quest and requires core fields on create", () => {
    expect(parseMission(ok, { create: true })).toMatchObject({ ok: true, data: { kind: "SIDE", target: 5 } });
    expect(parseMission({ ...ok, title: undefined }, { create: true }).ok).toBe(false);
    expect(parseMission({ target: 3 }, { create: false })).toMatchObject({ ok: true, data: { target: 3 } });
  });
  it.each([
    { kind: "WEEKLY" },
    { objective: "FLY" },
    { target: 0 },
    { target: 1.5 },
    { rewardPoints: -1 },
    { title: "" },
    { startsAt: "nope" },
    { startsAt: "2026-10-05T00:00:00Z", endsAt: "2026-10-04T00:00:00Z" },
  ])("rejects %j", (bad) => {
    expect(parseMission({ ...ok, ...bad }, { create: true }).ok).toBe(false);
  });
});

describe("progress and claiming", () => {
  it("counts only today's activity for daily quests, and resets tomorrow", async () => {
    const user = await createUser({ points: 0 });
    const m = await mission({ target: 2 });
    await proofAt(user.id, YESTERDAY); // doesn't count today
    await proofAt(user.id, NOW);
    await proofAt(user.id, NOW, "REJECTED"); // rejected proof doesn't count

    let { daily } = await getUserMissions(user.id, NOW);
    expect(daily[0]).toMatchObject({ id: m.id, progress: 1, target: 2, status: "active" });
    await expect(claimMission(user.id, m.id, NOW)).rejects.toThrow("Not done yet: 1/2");

    await proofAt(user.id, NOW);
    ({ daily } = await getUserMissions(user.id, NOW));
    expect(daily[0].status).toBe("ready");

    await claimMission(user.id, m.id, NOW);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ points: 20, xp: 10 });
    ({ daily } = await getUserMissions(user.id, NOW));
    expect(daily[0].status).toBe("claimed");
    const again = claimMission(user.id, m.id, NOW);
    await expect(again).rejects.toBeInstanceOf(MissionError);
    await expect(claimMission(user.id, m.id, NOW)).rejects.toThrow("Already claimed today");

    // Tomorrow it's a fresh quest: progress back to 0.
    ({ daily } = await getUserMissions(user.id, TOMORROW));
    expect(daily[0]).toMatchObject({ progress: 0, status: "active" });
    const claims = await prisma.missionClaim.findMany({ where: { userId: user.id } });
    expect(claims).toMatchObject([{ periodKey: "2026-10-03", pointsAwarded: 20, xpAwarded: 10 }]);
  });

  it("a daily quest created mid-day still counts that whole day", async () => {
    const user = await createUser();
    await proofAt(user.id, new Date("2026-10-02T17:00:00Z")); // 01:00 PHT on Oct 3
    const m = await mission({ startsAt: NOW }); // created 10:00 PHT the same day
    expect((await getUserMissions(user.id, NOW)).daily[0]).toMatchObject({ id: m.id, progress: 1, status: "ready" });
  });

  it("side quests count from their start date and can be claimed once", async () => {
    await syncTreeSpecies(prisma);
    await seedSeedlingProducts(prisma);
    const product = await prisma.seedlingProduct.findFirstOrThrow();
    const user = await createUser();
    const m = await mission({ kind: "SIDE", objective: "BUY_SEEDLINGS", target: 5, rewardPoints: 100, startsAt: new Date("2026-10-02T16:00:00Z") });
    const order = (quantity: number, createdAt: Date, status: "PENDING" | "CANCELLED" = "PENDING") =>
      prisma.order.create({ data: { userId: user.id, productId: product.id, quantity, totalPrice: 1, status, createdAt } });
    await order(10, YESTERDAY); // before the quest started
    await order(3, NOW);
    await order(9, NOW, "CANCELLED");
    expect((await getUserMissions(user.id, NOW)).side[0]).toMatchObject({ progress: 3, status: "active" });

    await order(2, TOMORROW);
    expect((await getUserMissions(user.id, TOMORROW)).side[0]).toMatchObject({ progress: 5, status: "ready" });
    await claimMission(user.id, m.id, TOMORROW);
    await expect(claimMission(user.id, m.id, new Date("2026-10-10T02:00:00Z"))).rejects.toThrow("Already claimed.");
  });

  it("tracks planted trees, invites and redemptions", async () => {
    const user = await createUser();
    const plant = await mission({ objective: "PLANT_TREES", target: 3 });
    const invite = await mission({ objective: "INVITE_FRIENDS", target: 2 });
    const redeem = await mission({ objective: "REDEEM_REWARD", target: 1 });

    const v = await proofAt(user.id, NOW, "APPROVED");
    await prisma.plantedTree.create({ data: { userId: user.id, psgcCode: "137404000", count: 3, verificationId: v.id, plantedAt: NOW } });
    await createUser({ referredByUserId: user.id, createdAt: NOW });
    await createUser({ referredByUserId: user.id, createdAt: YESTERDAY });
    const reward = await prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 1, valuePesos: 1 } });
    await prisma.redemptionHistory.create({ data: { userId: user.id, rewardId: reward.id, pointsSpent: 1, createdAt: NOW } });

    const { daily } = await getUserMissions(user.id, NOW);
    const byId = new Map(daily.map((d) => [d.id, d]));
    expect(byId.get(plant.id)).toMatchObject({ progress: 3, status: "ready" });
    expect(byId.get(invite.id)).toMatchObject({ progress: 1, status: "active" });
    expect(byId.get(redeem.id)).toMatchObject({ progress: 1, status: "ready" });
  });

  it("hides quests that are off, not started or ended", async () => {
    const user = await createUser();
    await mission({ isActive: false });
    await mission({ startsAt: TOMORROW });
    await mission({ kind: "SIDE", endsAt: YESTERDAY, startsAt: new Date("2026-09-01T00:00:00Z") });
    const live = await mission({ title: "Live one" });
    const { daily, side } = await getUserMissions(user.id, NOW);
    expect(daily.map((d) => d.id)).toEqual([live.id]);
    expect(side).toEqual([]);
  });

  it("the claim route needs a verified user", async () => {
    const m = await mission();
    signInAs(null);
    expect((await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: m.id }))).status).toBe(401);
    signInAs(await createUser({ emailVerified: null }));
    expect((await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: m.id }))).status).toBe(403);
    signInAs(await createUser());
    expect((await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: "nope" }))).status).toBe(404);
  });
});

describe("admin quest API", () => {
  const body = { kind: "DAILY", title: "Seedling run", objective: "BUY_SEEDLINGS", target: 1, rewardPoints: 15, rewardXp: 5 };

  it("creates, edits, toggles and deletes quests (admins only)", async () => {
    signInAs(await createUser());
    expect((await createMissionRoute(jsonRequest(body))).status).toBe(403);

    signInAs(await createUser({ role: "ADMIN" }));
    const created = await createMissionRoute(jsonRequest({ ...body, endsAt: "2026-12-31T16:00:00Z" }));
    expect(created.status).toBe(201);
    const { mission: m } = await created.json();
    expect(m).toMatchObject({ kind: "DAILY", title: "Seedling run", target: 1, rewardPoints: 15, isActive: true });
    expect((await createMissionRoute(jsonRequest({ ...body, target: 0 }))).status).toBe(400);

    const patch = (data: object) => updateMissionRoute(jsonRequest(data, "PATCH"), ctx({ id: m.id }));
    expect((await (await patch({ target: 3, isActive: false })).json()).mission).toMatchObject({ target: 3, isActive: false });
    expect((await patch({ startsAt: "2027-06-01T00:00:00Z" })).status).toBe(400); // would start after it ends
    expect((await patch({ endsAt: null })).status).toBe(200);

    const del = () => deleteMissionRoute(new Request("http://test.local", { method: "DELETE" }), ctx({ id: m.id }));
    expect((await del()).status).toBe(200);
    expect((await del()).status).toBe(404);
  });

  it("starter quests are added only when there are none", async () => {
    expect(await seedStarterMissions(prisma)).toBe(6);
    expect(await seedStarterMissions(prisma)).toBe(0);
    expect(await prisma.mission.count({ where: { kind: "DAILY" } })).toBe(3);
    expect(await prisma.mission.count({ where: { kind: "SIDE" } })).toBe(3);
  });
});

describe("closing a quest (isActive → false)", () => {
  const patch = (id: string, data: object) => updateMissionRoute(jsonRequest(data, "PATCH"), ctx({ id }));
  const notes = (userId: string) => prisma.notification.findMany({ where: { userId }, select: { message: true } });

  it("hides it, blocks claims, and notifies only users with unclaimed progress — exactly", async () => {
    const m = await mission({ title: "Daily proof", target: 2, startsAt: new Date("2026-01-01T00:00:00Z") });
    const partial = await createUser(); // 1/2 — incomplete
    const unclaimed = await createUser(); // 2/2 but not claimed
    const claimer = await createUser(); // claimed already
    const idle = await createUser(); // no activity
    const now = new Date();
    await proofAt(partial.id, now);
    await proofAt(unclaimed.id, now);
    await proofAt(unclaimed.id, now);
    await proofAt(claimer.id, now);
    await proofAt(claimer.id, now);
    await claimMission(claimer.id, m.id);
    await prisma.notification.deleteMany(); // ignore the claim notice

    signInAs(await createUser({ role: "ADMIN" }));
    const res = await patch(m.id, { isActive: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ notified: 2, mission: { isActive: false } });

    for (const u of [partial, unclaimed]) {
      expect(await notes(u.id)).toEqual([{ message: "The quest 'Daily proof' is now closed." }]);
    }
    expect(await notes(claimer.id)).toEqual([]);
    expect(await notes(idle.id)).toEqual([]);
    // Claimed rewards stay; the quest is gone from dashboards and can't be claimed.
    expect(await prisma.missionClaim.count({ where: { userId: claimer.id } })).toBe(1);
    expect((await getUserMissions(unclaimed.id)).daily).toEqual([]);
    await expect(claimMission(unclaimed.id, m.id)).rejects.toThrow("isn't available");

    // Turning it off again or back on sends nothing.
    expect(await (await patch(m.id, { isActive: false })).json()).toMatchObject({ notified: 0 });
    expect(await (await patch(m.id, { isActive: true })).json()).toMatchObject({ notified: 0, mission: { isActive: true } });
    expect(await prisma.notification.count()).toBe(2);
  });

  it("a claim racing a close either pays and gets no notice, or is refused and gets the notice", async () => {
    const m = await mission({ title: "Race", target: 1, startsAt: new Date("2026-01-01T00:00:00Z") });
    const user = await createUser();
    await proofAt(user.id, new Date());

    const [claim] = await Promise.allSettled([claimMission(user.id, m.id), closeMission(m.id)]);
    const claimed = await prisma.missionClaim.count({ where: { userId: user.id } });
    const closedNotices = (await notes(user.id)).filter((n) => n.message === "The quest 'Race' is now closed.");
    expect(claimed).toBe(claim.status === "fulfilled" ? 1 : 0);
    expect(closedNotices).toHaveLength(claimed ? 0 : 1);
    expect((await prisma.mission.findUnique({ where: { id: m.id } }))?.isActive).toBe(false);
  });

  it("uses the latest title when closing and renaming in one edit; scheduled quests notify nobody", async () => {
    const user = await createUser();
    await proofAt(user.id, new Date());
    const live = await mission({ title: "Old name", target: 5 });
    const scheduled = await mission({ title: "Later", startsAt: new Date(Date.now() + 86_400_000) });
    signInAs(await createUser({ role: "ADMIN" }));

    await patch(live.id, { title: "Proof sprint", isActive: false });
    expect(await notes(user.id)).toEqual([{ message: "The quest 'Proof sprint' is now closed." }]);
    expect(await (await patch(scheduled.id, { isActive: false })).json()).toMatchObject({ notified: 0 });
  });
});
