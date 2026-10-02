import { beforeEach, describe, expect, it } from "vitest";
import { POST as createSlotRoute } from "@/app/api/admin/slots/route";
import { PATCH as updateSlotRoute } from "@/app/api/admin/slots/[id]/route";
import { POST as processRedemption } from "@/app/api/admin/redemptions/[id]/route";
import { prisma } from "@/lib/prisma";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const newSlot = {
  latitude: 14.676,
  longitude: 121.0437,
  cityCode: "137404000",
  requiredPlantType: "Narra",
  pointsPerPlant: 12,
};

describe("POST /api/admin/slots", () => {
  it("is admin-only", async () => {
    signInAs(await createUser());
    expect((await createSlotRoute(jsonRequest(newSlot))).status).toBe(403);
    signInAs(null);
    expect((await createSlotRoute(jsonRequest(newSlot))).status).toBe(403);
  });

  it("creates an OPEN slot", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await createSlotRoute(jsonRequest(newSlot));
    expect(res.status).toBe(201);
    expect((await res.json()).slot).toMatchObject({
      ...newSlot,
      region: "National Capital Region",
      province: "Metro Manila",
      city: "Quezon City",
      status: "OPEN",
    });
  });

  it("rejects unknown city codes", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await createSlotRoute(jsonRequest({ ...newSlot, cityCode: "000000000" }))).status).toBe(400);
  });

  it("rejects pins outside the Philippines", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await createSlotRoute(jsonRequest({ ...newSlot, latitude: 1.35, longitude: 103.8 }));
    expect(res.status).toBe(400);
    expect(await prisma.slot.count()).toBe(0);
  });
});

describe("PATCH /api/admin/slots/:id", () => {
  it("updates slot rules but not coordinates", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const slot = await createSlot();
    const res = await updateSlotRoute(
      jsonRequest({ requiredPlantType: "Bakawan", pointsPerPlant: 30, status: "CLOSED", latitude: 10 }, "PATCH"),
      ctx({ id: slot.id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).slot).toMatchObject({
      requiredPlantType: "Bakawan",
      pointsPerPlant: 30,
      status: "CLOSED",
      latitude: slot.latitude,
    });
  });

  it("returns 404 for unknown slots and 400 for bad input", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const slot = await createSlot();
    expect((await updateSlotRoute(jsonRequest({ status: "OPEN" }, "PATCH"), ctx({ id: "nope" }))).status).toBe(404);
    expect((await updateSlotRoute(jsonRequest({ pointsPerPlant: 0 }, "PATCH"), ctx({ id: slot.id }))).status).toBe(400);
  });
});

describe("POST /api/admin/redemptions/:id", () => {
  async function pendingRedemption(costPoints = 500) {
    const user = await createUser({ points: 100 }); // balance after the 500-point deduction
    const reward = await prisma.reward.create({
      data: { rewardType: "EWALLET_CASH", brand: "GCash", costPoints, valuePesos: 50 },
    });
    const redemption = await prisma.redemptionHistory.create({
      data: { userId: user.id, rewardId: reward.id, eWalletNumber: "09171234567", pointsSpent: costPoints },
    });
    return { user, redemption };
  }

  it("fulfills with a reference note", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const { user, redemption } = await pendingRedemption();

    const res = await processRedemption(jsonRequest({ action: "fulfill", note: "REF-123" }), ctx({ id: redemption.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).redemption).toMatchObject({ status: "FULFILLED", adminNote: "REF-123" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(100);
  });

  it("rejecting refunds the reward cost exactly once", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const { user, redemption } = await pendingRedemption(500);

    expect((await processRedemption(jsonRequest({ action: "reject" }), ctx({ id: redemption.id }))).status).toBe(200);
    expect((await processRedemption(jsonRequest({ action: "reject" }), ctx({ id: redemption.id }))).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(600);
  });

  it("is admin-only and validates the action", async () => {
    const { redemption } = await pendingRedemption();
    signInAs(await createUser());
    expect((await processRedemption(jsonRequest({ action: "fulfill" }), ctx({ id: redemption.id }))).status).toBe(403);

    signInAs(await createUser({ role: "ADMIN" }));
    expect((await processRedemption(jsonRequest({ action: "refund" }), ctx({ id: redemption.id }))).status).toBe(400);
  });
});
