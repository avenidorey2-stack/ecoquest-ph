import { beforeEach, describe, expect, it } from "vitest";
import { POST as orderRoute } from "@/app/api/shop/orders/route";
import { POST as redeemRoute } from "@/app/api/rewards/[id]/redeem/route";
import { prisma } from "@/lib/prisma";
import { syncTreeSpecies } from "@/lib/species";
import { seedSeedlingProducts } from "@/lib/seedlings";
import { DELIVERY, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

async function seedShop() {
  await syncTreeSpecies(prisma);
  await seedSeedlingProducts(prisma);
  return prisma.seedlingProduct.findFirstOrThrow({ include: { species: true }, orderBy: { species: { sortOrder: "asc" } } });
}

const notesOf = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("admins are notified of planter activity", () => {
  it("a seedling order notifies every admin, linking to the orders queue", async () => {
    const p = await seedShop();
    const [admin1, admin2] = [await createUser({ role: "ADMIN" }), await createUser({ role: "ADMIN" })];
    const buyer = await createUser({ name: "Maria Santos" });
    signInAs(buyer);
    expect((await orderRoute(jsonRequest({ productId: p.id, quantity: 2, currency: "PESOS", delivery: DELIVERY }))).status).toBe(201);

    for (const admin of [admin1, admin2]) {
      const [note] = await notesOf(admin.id);
      expect(note.message).toContain(`New seedling order: Maria Santos ordered 2 × ${p.species.name} seedlings`);
      expect(note.message).toContain("cash on delivery");
      expect(note.link).toBe("/admin/shop?tab=orders");
    }
    // The buyer only gets their own confirmation.
    expect((await notesOf(buyer.id)).map((n) => n.message)).toEqual([expect.stringContaining("Order placed")]);
  });

  it("an admin ordering for themselves isn't notified about their own order", async () => {
    const p = await seedShop();
    const admin = await createUser({ role: "ADMIN", points: 10_000 });
    signInAs(admin);
    await orderRoute(jsonRequest({ productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY }));
    expect((await notesOf(admin.id)).map((n) => n.message)).toEqual([expect.stringContaining("Order placed")]);
  });

  it("a refused order notifies nobody", async () => {
    const p = await seedShop();
    const admin = await createUser({ role: "ADMIN" });
    signInAs(await createUser({ points: 0 }));
    expect((await orderRoute(jsonRequest({ productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY }))).status).toBe(402);
    expect(await notesOf(admin.id)).toEqual([]);
  });

  it("a reward redemption notifies admins, linking to the redemptions queue", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const reward = await prisma.reward.create({ data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 300, valuePesos: 100 } });
    signInAs(await createUser({ name: "Jose Rizal", points: 500 }));
    expect((await redeemRoute(jsonRequest({}), ctx({ id: reward.id }))).status).toBeLessThan(300);

    const [note] = await notesOf(admin.id);
    expect(note.message).toBe("New redemption request: Jose Rizal redeemed a ₱100 Grab voucher (300 pts).");
    expect(note.link).toBe("/admin/redemptions");
  });
});

describe("live notification channels", () => {
  it("every user gets their own secret, random channel token", async () => {
    const users = await Promise.all([createUser(), createUser(), createUser()]);
    const tokens = (await prisma.user.findMany({ where: { id: { in: users.map((u) => u.id) } }, select: { notifyToken: true } })).map(
      (u) => u.notifyToken,
    );
    expect(new Set(tokens).size).toBe(3);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
