import { beforeEach, describe, expect, it } from "vitest";
import { POST as orderRoute } from "@/app/api/shop/orders/route";
import { POST as orderAdminRoute } from "@/app/api/admin/orders/[id]/route";
import { prisma } from "@/lib/prisma";
import { syncTreeSpecies } from "@/lib/species";
import { seedSeedlingProducts } from "@/lib/seedlings";
import { deliveryWindow } from "@/lib/delivery";
import { DELIVERY, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

async function seedShop() {
  await syncTreeSpecies(prisma);
  await seedSeedlingProducts(prisma);
  return prisma.seedlingProduct.findFirstOrThrow({ orderBy: { species: { sortOrder: "asc" } } });
}

const order = (body: object) => orderRoute(jsonRequest(body));
const adminOrder = (id: string, action: string) => orderAdminRoute(jsonRequest({ action }), ctx({ id }));
const stock = async (id: string) => (await prisma.seedlingProduct.findUniqueOrThrow({ where: { id } })).stockQuantity;

describe("order delivery details", () => {
  it("saves the cleaned delivery details with a PESOS order", async () => {
    const p = await seedShop();
    signInAs(await createUser());
    const res = await order({ productId: p.id, quantity: 2, currency: "PESOS", delivery: DELIVERY });
    expect(res.status).toBe(201);
    const { order: created } = await res.json();
    // The response doesn't echo the address back.
    expect(created.delivery).toBeUndefined();

    const saved = await prisma.orderDelivery.findUniqueOrThrow({ where: { orderId: created.id } });
    expect(saved).toMatchObject({ ...DELIVERY, contactNumber: "09171234567" });
  });

  it("refuses any order without complete details, and reserves no stock or points", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 10_000 });
    signInAs(buyer);
    for (const currency of ["PESOS", "POINTS"]) {
      for (const delivery of [undefined, { ...DELIVERY, landmark: "" }, { ...DELIVERY, contactNumber: "12345" }]) {
        const res = await order({ productId: p.id, quantity: 1, currency, delivery });
        expect(res.status, currency).toBe(400);
        expect((await res.json()).error).toBeTruthy();
      }
    }
    expect(await stock(p.id)).toBe(p.stockQuantity);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).points).toBe(10_000);
    expect(await prisma.order.count()).toBe(0);
  });

  it("saves delivery details with a POINTS order too, and promises the 5–7 days", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 10_000 });
    signInAs(buyer);
    const res = await order({ productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY });
    expect(res.status).toBe(201);
    const { order: created } = await res.json();
    expect(await prisma.orderDelivery.findUniqueOrThrow({ where: { orderId: created.id } })).toMatchObject({ landmark: DELIVERY.landmark });
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(note.message).toContain("5–7 days after our team packs it");
  });

  it("promises delivery 5–7 days after packing: stamps packedAt and tells the buyer the dates", async () => {
    const p = await seedShop();
    const buyer = await createUser();
    signInAs(buyer);
    const { order: created } = await (await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY })).json();

    const placedNote = await prisma.notification.findFirstOrThrow({ where: { userId: buyer.id } });
    expect(placedNote.message).toContain("5–7 days after our team packs it");

    signInAs(await createUser({ role: "ADMIN" }));
    expect((await adminOrder(created.id, "advance")).status).toBe(200);
    const packed = await prisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(packed.status).toBe("PACKED");
    expect(packed.packedAt).toBeInstanceOf(Date);
    expect(Date.now() - packed.packedAt!.getTime()).toBeLessThan(60_000);

    const packedNote = await prisma.notification.findFirstOrThrow({ where: { userId: buyer.id }, orderBy: { createdAt: "desc" } });
    expect(packedNote.message).toContain(`is confirmed and being packed — expect it ${deliveryWindow(packed.packedAt!)}`);
    expect(packedNote.message).not.toMatch(/admin/i);

    // Later steps keep the original packing time.
    await adminOrder(created.id, "advance");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: created.id } })).packedAt).toEqual(packed.packedAt);
  });

  it("pauses ordering for 30 seconds after an order, without charging the refused one", async () => {
    const p = await seedShop();
    const buyer = await createUser({ points: 10_000 });
    signInAs(buyer);
    expect((await order({ productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY })).status).toBe(201);
    const afterFirst = { points: (await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).points, stock: await stock(p.id) };

    const again = await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY });
    expect(again.status).toBe(429);
    expect((await again.json()).error).toMatch(/Please wait \d+s before ordering again/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).points).toBe(afterFirst.points);
    expect(await stock(p.id)).toBe(afterFirst.stock);
    expect(await prisma.order.count()).toBe(1);

    // Once the 30 seconds have passed, ordering works again.
    await prisma.order.updateMany({ data: { createdAt: new Date(Date.now() - 31_000) } });
    expect((await order({ productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY })).status).toBe(201);
  });

  it("lets only one of two simultaneous orders (a double tap) through", async () => {
    const p = await seedShop();
    signInAs(await createUser({ points: 10_000 }));
    const body = { productId: p.id, quantity: 1, currency: "POINTS", delivery: DELIVERY };
    const statuses = (await Promise.all([order(body), order(body)])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 429]);
    expect(await prisma.order.count()).toBe(1);
  });

  it("the cooldown is per planter", async () => {
    const p = await seedShop();
    signInAs(await createUser());
    expect((await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY })).status).toBe(201);
    signInAs(await createUser());
    expect((await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY })).status).toBe(201);
  });

  it("deletes the delivery details with the order's owner", async () => {
    const p = await seedShop();
    const buyer = await createUser();
    signInAs(buyer);
    await order({ productId: p.id, quantity: 1, currency: "PESOS", delivery: DELIVERY });
    await prisma.user.delete({ where: { id: buyer.id } });
    expect(await prisma.orderDelivery.count()).toBe(0);
  });
});
