import { beforeEach, describe, expect, it } from "vitest";
import { POST as redeemRoute } from "@/app/api/rewards/[id]/redeem/route";
import { POST as createRewardRoute } from "@/app/api/admin/rewards/route";
import { PATCH as updateRewardRoute } from "@/app/api/admin/rewards/[id]/route";
import { POST as processRedemption } from "@/app/api/admin/redemptions/[id]/route";
import { prisma } from "@/lib/prisma";
import { MAX_PENDING_REDEMPTIONS } from "@/lib/rewards";
import { createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const gcash = (overrides = {}) =>
  prisma.reward.create({
    data: { rewardType: "EWALLET_CASH", brand: "GCash", costPoints: 500, valuePesos: 50, ...overrides },
  });
const grab = (overrides = {}) =>
  prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 300, valuePesos: 100, ...overrides } });

const redeem = (rewardId: string, body: object = {}) => redeemRoute(jsonRequest(body), ctx({ id: rewardId }));
const balance = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).points;

describe("POST /api/rewards/:id/redeem", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await redeem("x")).status).toBe(401);
  });

  it("deducts points and files a PENDING e-wallet cashout with a normalized number", async () => {
    const user = await createUser({ points: 800 });
    const reward = await gcash();
    signInAs(user);

    const res = await redeem(reward.id, { eWalletNumber: "+63 917 123 4567" });
    expect(res.status).toBe(201);
    const { redemption } = await res.json();
    expect(redemption).toMatchObject({
      status: "PENDING",
      eWalletNumber: "09171234567",
      pointsSpent: 500,
      rewardId: reward.id,
    });
    expect(await balance(user.id)).toBe(300);
  });

  it("vouchers don't need (or store) a number", async () => {
    const user = await createUser({ points: 300 });
    signInAs(user);
    const { redemption } = await (await redeem((await grab()).id, { eWalletNumber: "09171234567" })).json();
    expect(redemption.eWalletNumber).toBeNull();
    expect(await balance(user.id)).toBe(0);
  });

  it.each([undefined, "", "12345", "0817 123 4567"])("rejects cashouts with e-wallet number %j", async (num) => {
    const user = await createUser({ points: 800 });
    signInAs(user);
    expect((await redeem((await gcash()).id, { eWalletNumber: num })).status).toBe(400);
    expect(await balance(user.id)).toBe(800);
  });

  it("rejects when the balance is too low, without going negative", async () => {
    const user = await createUser({ points: 499 });
    signInAs(user);
    const res = await redeem((await gcash()).id, { eWalletNumber: "09171234567" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Not enough points/);
    expect(await balance(user.id)).toBe(499);
    expect(await prisma.redemptionHistory.count()).toBe(0);
  });

  it("only lets a balance be spent once", async () => {
    const user = await createUser({ points: 600 });
    const reward = await gcash();
    signInAs(user);
    expect((await redeem(reward.id, { eWalletNumber: "09171234567" })).status).toBe(201);
    expect((await redeem(reward.id, { eWalletNumber: "09171234567" })).status).toBe(400);
    expect(await balance(user.id)).toBe(100);
  });

  it("hides inactive and unknown rewards", async () => {
    signInAs(await createUser({ points: 9999 }));
    expect((await redeem((await grab({ isActive: false })).id)).status).toBe(404);
    expect((await redeem("missing")).status).toBe(404);
  });

  it(`caps pending requests at ${MAX_PENDING_REDEMPTIONS}`, async () => {
    const user = await createUser({ points: 10_000 });
    const reward = await grab();
    signInAs(user);
    for (let i = 0; i < MAX_PENDING_REDEMPTIONS; i++) {
      expect((await redeem(reward.id)).status).toBe(201);
    }
    expect((await redeem(reward.id)).status).toBe(409);
    expect(await balance(user.id)).toBe(10_000 - MAX_PENDING_REDEMPTIONS * 300);
  });

  it("refunds exactly what was paid if rejected, even after a price change", async () => {
    const user = await createUser({ points: 500 });
    const admin = await createUser({ role: "ADMIN" });
    const reward = await gcash({ costPoints: 500 });
    signInAs(user);
    const { redemption } = await (await redeem(reward.id, { eWalletNumber: "09171234567" })).json();

    await prisma.reward.update({ where: { id: reward.id }, data: { costPoints: 800 } });
    signInAs(admin);
    await processRedemption(jsonRequest({ action: "reject", note: "Wrong number" }), ctx({ id: redemption.id }));
    expect(await balance(user.id)).toBe(500);
  });

  it("doesn't touch weekly leaderboard points", async () => {
    const user = await createUser({ points: 300, weeklyPoints: 300, weeklyPointsWeekStart: new Date() });
    signInAs(user);
    await redeem((await grab()).id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).weeklyPoints).toBe(300);
  });
});

describe("admin reward catalogue", () => {
  const body = { rewardType: "VOUCHER", brand: "Shopee", costPoints: 1000, valuePesos: 200 };

  it("is admin-only", async () => {
    signInAs(await createUser());
    expect((await createRewardRoute(jsonRequest(body))).status).toBe(403);
    const reward = await grab();
    expect((await updateRewardRoute(jsonRequest({ isActive: false }, "PATCH"), ctx({ id: reward.id }))).status).toBe(403);
  });

  it("creates a reward (active by default)", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await createRewardRoute(jsonRequest(body));
    expect(res.status).toBe(201);
    expect((await res.json()).reward).toMatchObject({ ...body, isActive: true });
  });

  it("validates the payload", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await createRewardRoute(jsonRequest({ ...body, brand: "GCash" }))).status).toBe(400);
    expect((await createRewardRoute(jsonRequest({ ...body, costPoints: 0 }))).status).toBe(400);
  });

  it("edits price and hides rewards", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const reward = await grab();
    const res = await updateRewardRoute(
      jsonRequest({ costPoints: 350, isActive: false }, "PATCH"),
      ctx({ id: reward.id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reward).toMatchObject({ costPoints: 350, isActive: false });
  });

  it("404s for unknown rewards and rejects brand/type mismatches", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await updateRewardRoute(jsonRequest({ costPoints: 1 }, "PATCH"), ctx({ id: "nope" }))).status).toBe(404);
    const reward = await grab();
    expect((await updateRewardRoute(jsonRequest({ brand: "Maya" }, "PATCH"), ctx({ id: reward.id }))).status).toBe(400);
  });
});
