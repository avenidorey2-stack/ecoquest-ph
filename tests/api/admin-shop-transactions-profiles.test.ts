import { beforeEach, describe, expect, it } from "vitest";
import { POST as orderRoute } from "@/app/api/shop/orders/route";
import { POST as orderAdminRoute } from "@/app/api/admin/orders/[id]/route";
import { PATCH as productAdminRoute } from "@/app/api/admin/seedlings/[id]/route";
import { POST as createSlotRoute } from "@/app/api/admin/slots/route";
import { DELETE as deleteSlotRoute } from "@/app/api/admin/slots/[id]/route";
import { POST as claimRoute } from "@/app/api/slots/[id]/claim/route";
import { GET as listSlots } from "@/app/api/slots/route";
import { POST as redeemRoute } from "@/app/api/rewards/[id]/redeem/route";
import { POST as processRedemption } from "@/app/api/admin/redemptions/[id]/route";
import { GET as planterRoute } from "@/app/api/planters/[id]/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { GET as getMedia } from "@/app/api/media/[key]/route";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/client";
import { syncTreeSpecies } from "@/lib/species";
import { seedSeedlingProducts } from "@/lib/seedlings";
import { CODES, DELIVERY, createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

async function seedShop() {
  await syncTreeSpecies(prisma);
  await seedSeedlingProducts(prisma);
  return prisma.seedlingProduct.findFirstOrThrow({ include: { species: true }, orderBy: { species: { sortOrder: "asc" } } });
}

// Every order needs delivery details.
const order = (body: object) => orderRoute(jsonRequest({ delivery: DELIVERY, ...body }));
const adminOrder = (id: string, action: string) => orderAdminRoute(jsonRequest({ action }), ctx({ id }));
const points = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).points;
const stock = async (id: string) => (await prisma.seedlingProduct.findUniqueOrThrow({ where: { id } })).stockQuantity;
const ledger = (userId: string) => prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("dual-currency seedling orders", () => {
  it("PESOS orders reserve stock, charge no points and are recorded as cash on delivery", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 500 });
    signInAs(buyer);

    const res = await order({ productId: p.id, quantity: 4, currency: "pesos", delivery: DELIVERY });
    expect(res.status).toBe(201);
    const { order: created } = await res.json();
    expect(created).toMatchObject({ currencyUsed: "PESOS", totalPrice: Math.round(p.priceInPesos * 4 * 100) / 100, status: "PENDING" });
    expect(await points(buyer.id)).toBe(500);
    expect(await stock(p.id)).toBe(p.stockQuantity - 4);

    const [tx] = await ledger(buyer.id);
    expect(tx).toMatchObject({ kind: "SEEDLING_ORDER", currency: "PESOS", amount: created.totalPrice, orderId: created.id });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(note.message).toContain("cash on delivery");
  });

  it("rounds peso totals to centavos", async () => {
    const p = await seedShop();
    await prisma.seedlingProduct.update({ where: { id: p.id }, data: { priceInPesos: 0.1 } });
    signInAs(await createUser());
    const { order: created } = await (await order({ productId: p.id, quantity: 3, currency: "PESOS", delivery: DELIVERY })).json();
    expect(created.totalPrice).toBe(0.3);
  });

  it("refuses pesos when the product has no peso price, and unknown currencies", async () => {
    const p = await seedShop();
    await prisma.seedlingProduct.update({ where: { id: p.id }, data: { priceInPesos: 0 } });
    signInAs(await createUser({ points: 10_000 }));
    expect((await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY })).status).toBe(400);
    expect((await order({ productId: p.id, quantity: 1, currency: "USD" })).status).toBe(400);
    expect(await stock(p.id)).toBe(p.stockQuantity);
  });

  it("POINTS orders deduct points and write a ledger row", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 1000 });
    signInAs(buyer);
    await order({ productId: p.id, quantity: 2, currency: "POINTS" });
    expect(await points(buyer.id)).toBe(1000 - 2 * p.priceInPoints);
    expect(await ledger(buyer.id)).toMatchObject([{ kind: "SEEDLING_ORDER", currency: "POINTS", amount: 2 * p.priceInPoints }]);
  });
});

describe("reward redemptions in the ledger", () => {
  it("records the redemption and its refund when declined", async () => {
    const member = await createUser({ points: 400 });
    const reward = await prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 300, valuePesos: 100 } });
    signInAs(member);
    const { redemption } = await (await redeemRoute(jsonRequest({}), ctx({ id: reward.id }))).json();

    signInAs(await createUser({ role: "ADMIN" }));
    await processRedemption(jsonRequest({ action: "reject" }), ctx({ id: redemption.id }));

    expect(await ledger(member.id)).toMatchObject([
      { kind: "REWARD_REDEMPTION", currency: "POINTS", amount: 300, redemptionId: redemption.id, description: "₱100 Grab voucher" },
      { kind: "REFUND", currency: "POINTS", amount: 300, redemptionId: redemption.id },
    ]);
    expect(await points(member.id)).toBe(400);
  });
});

describe("POST /api/admin/orders/:id", () => {
  async function placed(currency: "POINTS" | "PESOS" = "POINTS") {
    const p = await seedShop();
    const buyer = await createUser({ points: 1000 });
    signInAs(buyer);
    const { order: created } = await (await order({ productId: p.id, quantity: 2, currency, delivery: DELIVERY })).json();
    signInAs(await createUser({ role: "ADMIN" }));
    return { p, buyer, orderId: created.id as string };
  }

  it("is admin-only", async () => {
    const { buyer, orderId } = await placed();
    signInAs(buyer);
    expect((await adminOrder(orderId, "advance")).status).toBe(403);
  });

  it("advances PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED, notifying the buyer each step", async () => {
    const { buyer, orderId } = await placed();
    for (const expected of ["PACKED", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const res = await adminOrder(orderId, "advance");
      expect(res.status).toBe(200);
      expect((await res.json()).order.status).toBe(expected);
    }
    expect((await adminOrder(orderId, "advance")).status).toBe(409);
    expect((await adminOrder(orderId, "cancel")).status).toBe(409);
    const messages = (await prisma.notification.findMany({ where: { userId: buyer.id } })).map((n) => n.message);
    expect(messages).toHaveLength(4); // order placed + three status updates
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining("is packed"),
        expect.stringContaining("is out for delivery"),
        expect.stringContaining("was delivered"),
      ]),
    );
  });

  it("cancelling a POINTS order restocks and refunds the points", async () => {
    const { p, buyer, orderId } = await placed("POINTS");
    await adminOrder(orderId, "advance"); // packed — still cancellable
    const res = await adminOrder(orderId, "cancel");
    expect((await res.json()).order.status).toBe("CANCELLED");
    expect(await points(buyer.id)).toBe(1000);
    expect(await stock(p.id)).toBe(p.stockQuantity);
    expect((await ledger(buyer.id)).map((t) => t.kind)).toEqual(["SEEDLING_ORDER", "REFUND"]);
  });

  it("cancelling a PESOS order restocks without a points refund", async () => {
    const { p, buyer, orderId } = await placed("PESOS");
    await adminOrder(orderId, "cancel");
    expect(await points(buyer.id)).toBe(1000);
    expect(await stock(p.id)).toBe(p.stockQuantity);
    expect((await ledger(buyer.id)).map((t) => t.kind)).toEqual(["SEEDLING_ORDER"]);
  });

  it("rejects unknown actions and orders", async () => {
    const { orderId } = await placed();
    expect((await adminOrder(orderId, "ship")).status).toBe(400);
    expect((await adminOrder("nope", "advance")).status).toBe(404);
  });
});

describe("PATCH /api/admin/seedlings/:id", () => {
  const patch = (id: string, body: object) => productAdminRoute(jsonRequest(body, "PATCH"), ctx({ id }));

  it("updates prices, stock and visibility", async () => {
    const p = await seedShop();
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await patch(p.id, { priceInPoints: 75, priceInPesos: 39.5, stockQuantity: 12, isActive: false });
    expect(res.status).toBe(200);
    expect((await res.json()).product).toMatchObject({ priceInPoints: 75, priceInPesos: 39.5, stockQuantity: 12, isActive: false });
  });

  it.each([{ priceInPoints: 0 }, { priceInPesos: 1.234 }, { priceInPesos: -1 }, { stockQuantity: -1 }, { stockQuantity: 1.5 }, { isActive: "yes" }, {}])(
    "rejects %j",
    async (body) => {
      const p = await seedShop();
      signInAs(await createUser({ role: "ADMIN" }));
      expect((await patch(p.id, body)).status).toBe(400);
    },
  );

  it("is admin-only and 404s unknown products", async () => {
    const p = await seedShop();
    signInAs(await createUser());
    expect((await patch(p.id, { stockQuantity: 1 })).status).toBe(403);
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await patch("nope", { stockQuantity: 1 })).status).toBe(404);
  });
});

describe("slot capacity and removal", () => {
  it("blocks claims once maxParticipants planters are active, and reports spots left", async () => {
    const slot = await createSlot({ maxParticipants: 1 });
    const first = await createUser();
    signInAs(first);
    expect((await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id }))).status).toBe(201);

    const second = await createUser();
    signInAs(second);
    const res = await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("full");

    const { slots } = await (await listSlots(new Request("http://test.local/api/slots"))).json();
    expect(slots[0]).toMatchObject({ participants: 1, maxParticipants: 1, spotsLeft: 0, claimable: false });
  });

  it("validates maxParticipants when admins create slots", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const base = { latitude: 14.676, longitude: 121.0437, cityCode: CODES.quezonCity, requiredPlantType: "Narra", pointsPerPlant: 10 };
    expect((await createSlotRoute(jsonRequest({ ...base, maxParticipants: 0 }))).status).toBe(400);
    const res = await createSlotRoute(jsonRequest({ ...base, maxParticipants: 5 }));
    expect((await res.json()).slot.maxParticipants).toBe(5);
    expect((await (await createSlotRoute(jsonRequest(base))).json()).slot.maxParticipants).toBe(20);
  });

  it("deletes slots without quests, but refuses slots with planting history", async () => {
    const empty = await createSlot();
    const used = await createSlot();
    await prisma.quest.create({ data: { userId: (await createUser()).id, slotId: used.id, status: "COMPLETED" } });
    const del = (id: string) => deleteSlotRoute(new Request("http://test.local", { method: "DELETE" }), ctx({ id }));

    signInAs(await createUser());
    expect((await del(empty.id)).status).toBe(403);

    signInAs(await createUser({ role: "ADMIN" }));
    expect((await del(empty.id)).status).toBe(200);
    expect(await prisma.slot.findUnique({ where: { id: empty.id } })).toBeNull();
    expect((await del(used.id)).status).toBe(409);
    expect(await prisma.slot.findUnique({ where: { id: used.id } })).not.toBeNull();
    expect((await del("nope")).status).toBe(404);
  });
});

describe("GET /api/planters/:id", () => {
  const get = (id: string) => planterRoute(new Request("http://test.local"), ctx({ id }));

  it("returns public stats, approved proof only and unlocked achievements — never the email", async () => {
    const planter = await createUser({ name: "Maria", points: 420, totalPlants: 7, xp: 350 });
    const slot = await createSlot();
    const quest = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id, status: "COMPLETED", plantCount: 7 } });
    await prisma.verification.create({ data: { questId: quest.id, mediaUrl: "/api/media/approved.jpg", mediaType: "image/jpeg", status: "APPROVED", reviewedAt: new Date() } });
    await prisma.verification.create({ data: { questId: quest.id, mediaUrl: "/api/media/pending.jpg", mediaType: "image/jpeg" } });
    const badge = await prisma.achievement.create({ data: { key: "first-tree", name: "First Tree Planted", description: "d", icon: "🌱", category: "Planting" } });
    await prisma.userAchievement.create({ data: { userId: planter.id, achievementId: badge.id } });

    signInAs(await createUser());
    const res = await get(planter.id);
    expect(res.status).toBe(200);
    const { profile } = await res.json();
    expect(profile).toMatchObject({ name: "Maria", points: 420, totalPlants: 7, level: 3, title: "Sapling" });
    expect(profile.proofs.map((p: { url: string }) => p.url)).toEqual(["/api/media/approved.jpg"]);
    expect(profile.achievements).toMatchObject([{ key: "first-tree", name: "First Tree Planted", icon: "🌱" }]);
    expect(JSON.stringify(profile)).not.toContain(planter.email!);
  });

  it("hides admins from others, needs a session, and 404s unknown ids", async () => {
    const admin = await createUser({ role: "ADMIN" });
    signInAs(await createUser());
    expect((await get(admin.id)).status).toBe(404);
    expect((await get("nope")).status).toBe(404);
    signInAs(null);
    expect((await get(admin.id)).status).toBe(401);
  });

  it("lets other planters view approved proof media (pending proof stays private)", async () => {
    const planter = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const quest = await prisma.quest.create({ data: { userId: planter.id, slotId: (await createSlot()).id } });
    signInAs(planter);
    const { verification } = await (await submitProof(uploadRequest(jpeg(512), 1), ctx({ id: quest.id }))).json();
    const key = verification.mediaUrl.split("/").pop();
    const fetchAs = async (u: { id: string; role: Role }) => {
      signInAs(u);
      return (await getMedia(new Request("http://test.local"), ctx({ key }))).status;
    };

    const stranger = await createUser();
    expect(await fetchAs(stranger)).toBe(404);
    signInAs(admin);
    await review(jsonRequest({ action: "approve" }), ctx({ id: verification.id }));
    expect(await fetchAs(stranger)).toBe(200);
  });
});

describe("slot barangay, permanent delete and the admin all-slots map", () => {
  const delPermanent = (id: string) =>
    deleteSlotRoute(new Request("http://test.local/api/admin/slots/x?permanent=true", { method: "DELETE" }), ctx({ id }));

  it("stores an optional barangay on create and validates it", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const base = { latitude: 14.676, longitude: 121.0437, cityCode: CODES.quezonCity, requiredPlantType: "Narra", pointsPerPlant: 10 };
    const created = await (await createSlotRoute(jsonRequest({ ...base, barangay: "  Bagong Silangan " }))).json();
    expect(created.slot.barangay).toBe("Bagong Silangan");
    expect((await (await createSlotRoute(jsonRequest({ ...base, barangay: "" }))).json()).slot.barangay).toBeNull();
    expect((await createSlotRoute(jsonRequest({ ...base, barangay: "x".repeat(101) }))).status).toBe(400);
    expect((await createSlotRoute(jsonRequest({ ...base, barangay: 5 }))).status).toBe(400);
  });

  it("permanently deleting a slot keeps approved proof, trees and achievements; cancels in-progress quests", async () => {
    await syncTreeSpecies(prisma);
    const planter = await createUser();
    const waiting = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const slot = await createSlot({ pointsPerPlant: 10 });

    // A verified planting (with a real proof file) and another planter mid-quest.
    const quest = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id } });
    signInAs(planter);
    const { verification } = await (await submitProof(uploadRequest(jpeg(256), 2), ctx({ id: quest.id }))).json();
    signInAs(admin);
    await review(jsonRequest({ action: "approve" }), ctx({ id: verification.id }));
    await prisma.quest.create({ data: { userId: waiting.id, slotId: slot.id } });
    const narra = () => prisma.treeSpecies.findUniqueOrThrow({ where: { slug: "narra" } });
    expect((await narra()).totalPlanted).toBe(2);
    const pointsBefore = await points(planter.id);

    // Without the flag the history is protected.
    expect((await deleteSlotRoute(new Request("http://test.local", { method: "DELETE" }), ctx({ id: slot.id }))).status).toBe(409);

    signInAs(planter);
    expect((await delPermanent(slot.id)).status).toBe(403);
    signInAs(admin);
    const res = await delPermanent(slot.id);
    expect(res.status).toBe(200);
    // Approval chained a new ACTIVE quest for the planter, so both planters had a quest in progress.
    expect(await res.json()).toMatchObject({ deleted: true, keptApprovedHistory: true, deletedQuests: 2, deletedMedia: 0, notified: 2 });

    // The slot is gone from every list…
    expect((await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).deletedAt).not.toBeNull();
    const { slots } = await (await listSlots(new Request("http://test.local/api/slots?scope=all"))).json();
    expect(slots).toHaveLength(0);
    expect(await prisma.quest.count({ where: { slotId: slot.id, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } } })).toBe(0);
    // …but the approved proof, the trees and the points are permanent.
    expect(await prisma.quest.count({ where: { slotId: slot.id, status: "COMPLETED" } })).toBe(1);
    expect(await prisma.verification.count({ where: { status: "APPROVED" } })).toBe(1);
    expect(await prisma.plantedTree.count()).toBe(1);
    expect((await narra()).totalPlanted).toBe(2);
    expect(await points(planter.id)).toBe(pointsBefore);

    // The proof file is still served, and still on the planter's public profile with its date.
    signInAs(waiting);
    const key = verification.mediaUrl.split("/").pop();
    expect((await getMedia(new Request("http://test.local"), ctx({ key }))).status).toBe(200);
    const { profile } = await (await planterRoute(new Request("http://test.local"), ctx({ id: planter.id }))).json();
    expect(profile.proofs).toHaveLength(1);
    expect(profile.proofs[0]).toMatchObject({ plantType: "Narra", plantCount: 2 });
    expect(profile.proofs[0].approvedAt).toEqual(expect.any(String));

    const note = await prisma.notification.findFirstOrThrow({ where: { userId: waiting.id } });
    expect(note.message).toContain("is now closed, so your quest there has ended.");
    signInAs(admin);
    expect((await delPermanent(slot.id)).status).toBe(404); // already deleted
    expect((await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id }))).status).toBe(404);
  });

  it("permanently deleting a slot without approved plantings erases it and its pending proof", async () => {
    const planter = await createUser();
    const slot = await createSlot();
    const quest = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id } });
    signInAs(planter);
    const { verification } = await (await submitProof(uploadRequest(jpeg(128), 1), ctx({ id: quest.id }))).json();

    signInAs(await createUser({ role: "ADMIN" }));
    expect(await (await delPermanent(slot.id)).json()).toMatchObject({ keptApprovedHistory: false, deletedQuests: 1, deletedMedia: 1, notified: 1 });
    expect(await prisma.slot.findUnique({ where: { id: slot.id } })).toBeNull();
    expect(await prisma.verification.count()).toBe(0);

    signInAs(planter);
    const key = verification.mediaUrl.split("/").pop();
    expect((await getMedia(new Request("http://test.local"), ctx({ key }))).status).toBe(404); // file removed too
  });

  it("achievements stay on the public profile, each with its acquired date", async () => {
    const planter = await createUser();
    const badge = await prisma.achievement.create({ data: { key: "trees-10", name: "Green Thumb", description: "d", icon: "🌿", category: "Planting" } });
    const unlockedAt = new Date("2026-09-15T03:00:00Z");
    await prisma.userAchievement.create({ data: { userId: planter.id, achievementId: badge.id, unlockedAt } });

    signInAs(await createUser());
    const { profile } = await (await planterRoute(new Request("http://test.local"), ctx({ id: planter.id }))).json();
    expect(profile.achievements).toEqual([
      expect.objectContaining({ key: "trees-10", name: "Green Thumb", category: "Planting", unlockedAt: unlockedAt.toISOString() }),
    ]);
  });

  it("scope=all lists every slot (closed too) for admins only", async () => {
    await createSlot();
    await createSlot({ status: "CLOSED", cityCode: CODES.makati, city: "Makati" });
    const list = () => listSlots(new Request("http://test.local/api/slots?scope=all"));

    signInAs(await createUser());
    expect((await list()).status).toBe(403);
    signInAs(await createUser({ role: "ADMIN", cityCode: null }));
    const { slots } = await (await list()).json();
    expect(slots.map((s: { status: string }) => s.status).sort()).toEqual(["CLOSED", "OPEN"]);
  });
});
