import { beforeEach, describe, expect, it } from "vitest";
import { POST as orderRoute } from "@/app/api/shop/orders/route";
import { GET as listNotifications, PATCH as markRead } from "@/app/api/notifications/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { POST as createSlotRoute } from "@/app/api/admin/slots/route";
import { POST as processRedemption } from "@/app/api/admin/redemptions/[id]/route";
import { prisma } from "@/lib/prisma";
import { syncTreeSpecies } from "@/lib/species";
import { DEFAULT_SEEDLING_STOCK, MAX_ORDER_QUANTITY, seedSeedlingProducts } from "@/lib/seedlings";
import { notify } from "@/lib/notifications";
import { CODES, DELIVERY, createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

async function seedShop() {
  await syncTreeSpecies(prisma);
  await seedSeedlingProducts(prisma);
  return prisma.seedlingProduct.findFirstOrThrow({ include: { species: true }, orderBy: { species: { sortOrder: "asc" } } });
}

// Every order needs delivery details; tests override `delivery` to check that.
const order = (body: object) => orderRoute(jsonRequest({ delivery: DELIVERY, ...body }));
const user = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
const product = (id: string) => prisma.seedlingProduct.findUniqueOrThrow({ where: { id } });
const notificationsOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("seedSeedlingProducts", () => {
  it("creates one product per species, and re-running keeps admin-edited price and stock", async () => {
    await syncTreeSpecies(prisma);
    const species = await prisma.treeSpecies.count();
    expect(await seedSeedlingProducts(prisma)).toEqual({ created: species, pesosFilled: 0 });
    expect(await prisma.seedlingProduct.count()).toBe(species);

    const first = await prisma.seedlingProduct.findFirstOrThrow();
    expect(first.stockQuantity).toBe(DEFAULT_SEEDLING_STOCK);
    expect(first.priceInPesos).toBeGreaterThan(0);
    await prisma.seedlingProduct.update({ where: { id: first.id }, data: { priceInPoints: 999, priceInPesos: 12.5, stockQuantity: 3 } });

    expect(await seedSeedlingProducts(prisma)).toEqual({ created: 0, pesosFilled: 0 });
    expect(await product(first.id)).toMatchObject({ priceInPoints: 999, priceInPesos: 12.5, stockQuantity: 3 });
  });

  it("fills a default peso price only where none is set", async () => {
    await syncTreeSpecies(prisma);
    await seedSeedlingProducts(prisma);
    await prisma.seedlingProduct.updateMany({ data: { priceInPesos: 0 } });
    const { pesosFilled } = await seedSeedlingProducts(prisma);
    expect(pesosFilled).toBe(await prisma.seedlingProduct.count());
    expect(await prisma.seedlingProduct.count({ where: { priceInPesos: 0 } })).toBe(0);
  });
});

describe("POST /api/shop/orders", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await order({ productId: "x", quantity: 1 })).status).toBe(401);
  });

  it("deducts points and stock, records the order and notifies the buyer", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 1000 });
    signInAs(buyer);

    const res = await order({ productId: p.id, quantity: 3 });
    expect(res.status).toBe(201);
    const { order: created } = await res.json();
    expect(created).toMatchObject({ quantity: 3, totalPrice: 3 * p.priceInPoints, status: "PENDING", userId: buyer.id });

    expect((await user(buyer.id)).points).toBe(1000 - 3 * p.priceInPoints);
    expect((await product(p.id)).stockQuantity).toBe(p.stockQuantity - 3);
    const [note] = await notificationsOf(buyer.id);
    expect(note.message).toContain(`3 × ${p.species.name}`);
    expect(note.link).toBe("/transactions");
  });

  it("rejects an unaffordable order and leaves stock untouched", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: p.priceInPoints - 1 });
    signInAs(buyer);

    expect((await order({ productId: p.id, quantity: 1 })).status).toBe(402);
    expect((await user(buyer.id)).points).toBe(p.priceInPoints - 1);
    expect((await product(p.id)).stockQuantity).toBe(p.stockQuantity);
    expect(await prisma.order.count()).toBe(0);
  });

  it("rejects orders above the remaining stock without charging", async () => {
    const p = await seedShop();
    await prisma.seedlingProduct.update({ where: { id: p.id }, data: { stockQuantity: 2 } });
    const buyer = await createUser({ points: 100_000 });
    signInAs(buyer);

    const res = await order({ productId: p.id, quantity: 3 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Only 2");
    expect((await user(buyer.id)).points).toBe(100_000);
  });

  it.each([0, -1, 1.5, "2", MAX_ORDER_QUANTITY + 1, undefined])("rejects quantity %j", async (quantity) => {
    const p = await seedShop();
    signInAs(await createUser({ points: 100_000 }));
    expect((await order({ productId: p.id, quantity })).status).toBe(400);
  });

  it("rejects inactive and unknown products", async () => {
    const p = await seedShop();
    await prisma.seedlingProduct.update({ where: { id: p.id }, data: { isActive: false } });
    signInAs(await createUser({ points: 100_000 }));
    expect((await order({ productId: p.id, quantity: 1 })).status).toBe(404);
    expect((await order({ productId: "nope", quantity: 1 })).status).toBe(404);
  });

  it("requires a verified email", async () => {
    const p = await seedShop();
    signInAs(await createUser({ points: 100_000, emailVerified: null }));
    expect((await order({ productId: p.id, quantity: 1 })).status).toBe(403);
  });
});

describe("/api/notifications", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await listNotifications()).status).toBe(401);
    expect((await markRead()).status).toBe(401);
  });

  it("lists only the viewer's notifications, newest first, and marks them read", async () => {
    const me = await createUser();
    const other = await createUser();
    await notify(prisma, me.id, "first");
    await notify(prisma, me.id, "second", "/rewards");
    await notify(prisma, other.id, "not mine");
    signInAs(me);

    const list = await (await listNotifications()).json();
    expect(list.unreadCount).toBe(2);
    expect(list.notifications.map((n: { message: string }) => n.message)).toEqual(["second", "first"]);

    expect(await (await markRead()).json()).toEqual({ marked: 2 });
    expect((await (await listNotifications()).json()).unreadCount).toBe(0);
    expect(await prisma.notification.count({ where: { userId: other.id, isRead: false } })).toBe(1);
  });

  it("drops off-site links", async () => {
    const me = await createUser();
    const n = await notify(prisma, me.id, "x", "https://evil.example");
    const m = await notify(prisma, me.id, "y", "//evil.example");
    expect([n.link, m.link]).toEqual([null, null]);
  });
});

describe("notification triggers", () => {
  async function pendingProof(planterId: string) {
    const slot = await createSlot();
    const quest = await prisma.quest.create({
      data: { userId: planterId, slotId: slot.id, status: "PENDING_VERIFICATION" },
    });
    return prisma.verification.create({ data: { questId: quest.id, mediaUrl: `proof-${quest.id}.jpg`, mediaType: "image/jpeg", plantCount: 2 } });
  }

  it("approving a planting notifies the planter", async () => {
    const planter = await createUser();
    const v = await pendingProof(planter.id);
    signInAs(await createUser({ role: "ADMIN" }));

    expect((await review(jsonRequest({ action: "approve" }), ctx({ id: v.id }))).status).toBe(200);
    const [note] = await notificationsOf(planter.id);
    expect(note.message).toBe("Quest complete! You planted 2 Narra — +20 pts for this proof.");
  });

  it("rejecting a planting notifies the planter with the reason", async () => {
    const planter = await createUser();
    const v = await pendingProof(planter.id);
    signInAs(await createUser({ role: "ADMIN" }));

    await review(jsonRequest({ action: "reject", reason: "Blurry photo" }), ctx({ id: v.id }));
    const [note] = await notificationsOf(planter.id);
    expect(note.message).toContain("not approved: Blurry photo");
  });

  it("a new slot notifies users in that city only", async () => {
    const local = await createUser(); // Quezon City
    const elsewhere = await createUser({ cityCode: CODES.makati, city: "Makati" });
    signInAs(await createUser({ role: "ADMIN", cityCode: null }));

    const res = await createSlotRoute(
      jsonRequest({ latitude: 14.676, longitude: 121.0437, cityCode: CODES.quezonCity, requiredPlantType: "Narra", pointsPerPlant: 10 }),
    );
    expect(res.status).toBe(201);
    expect((await notificationsOf(local.id))[0].message).toContain("New planting slot available");
    expect(await notificationsOf(elsewhere.id)).toHaveLength(0);
  });

  it("processing a redemption notifies the user", async () => {
    const member = await createUser();
    const reward = await prisma.reward.create({
      data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 300, valuePesos: 100 },
    });
    const r = await prisma.redemptionHistory.create({ data: { userId: member.id, rewardId: reward.id, pointsSpent: 300 } });
    signInAs(await createUser({ role: "ADMIN" }));

    await processRedemption(jsonRequest({ action: "reject", note: "Out of stock" }), ctx({ id: r.id }));
    const [note] = await notificationsOf(member.id);
    expect(note.message).toBe("Your ₱100 Grab redemption was declined — 300 pts refunded.");
    expect(note.link).toBe("/rewards");
  });
});
