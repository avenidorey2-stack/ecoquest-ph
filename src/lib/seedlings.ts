import type { Currency, OrderStatus, Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { recordTransaction } from "@/lib/transactions";
import { formatPesos, formatPoints } from "@/lib/format";
import { TREE_CATEGORY_ORDER } from "@/data/tree-species";

type Db = PrismaClient | Prisma.TransactionClient;

export const MAX_ORDER_QUANTITY = 50;
export const DEFAULT_SEEDLING_STOCK = 100;
const MAX_PRICE_POINTS = 100_000;
const MAX_PRICE_PESOS = 100_000;
const MAX_STOCK = 1_000_000;

const [NATIONAL, MAHOGANY, COASTAL, RESIN, WATERSHED, FRUIT] = TREE_CATEGORY_ORDER;

/** Starting prices per species category; admins edit them in /admin/shop. */
const DEFAULT_PRICES: Record<string, { points: number; pesos: number }> = {
  [NATIONAL]: { points: 60, pesos: 45 },
  [MAHOGANY]: { points: 50, pesos: 35 },
  [COASTAL]: { points: 40, pesos: 25 },
  [RESIN]: { points: 70, pesos: 50 },
  [WATERSHED]: { points: 45, pesos: 30 },
  [FRUIT]: { points: 35, pesos: 25 },
};
const FALLBACK_PRICE = { points: 50, pesos: 35 };
const defaultPrice = (category: string) => DEFAULT_PRICES[category] ?? FALLBACK_PRICE;

/** Rounds to whole centavos so peso totals never carry float noise (0.1 + 0.2 …). */
export const toCentavos = (pesos: number) => Math.round(pesos * 100) / 100;

const plural = (n: number, word: string) => `${n} × ${word} seedling${n === 1 ? "" : "s"}`;

/**
 * Stocks the shop (prisma/seed.ts): creates a product for every species that lacks one, and
 * fills a default peso price where none is set. Admin-edited prices and stock are kept.
 */
export async function seedSeedlingProducts(db: Db) {
  const species = await db.treeSpecies.findMany({ select: { id: true, category: true } });
  const { count: created } = await db.seedlingProduct.createMany({
    data: species.map((s) => ({
      speciesId: s.id,
      priceInPoints: defaultPrice(s.category).points,
      priceInPesos: defaultPrice(s.category).pesos,
      stockQuantity: DEFAULT_SEEDLING_STOCK,
    })),
    skipDuplicates: true,
  });
  let pesosFilled = 0;
  for (const s of species) {
    const { count } = await db.seedlingProduct.updateMany({
      where: { speciesId: s.id, priceInPesos: 0 },
      data: { priceInPesos: defaultPrice(s.category).pesos },
    });
    pesosFilled += count;
  }
  return { created, pesosFilled };
}

export class OrderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function parseOrderQuantity(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_ORDER_QUANTITY
    ? (value as number)
    : null;
}

/** Accepts "POINTS"/"PESOS" in any case ("Points", "pesos"…). Missing → POINTS. */
export function parseCurrency(value: unknown): Currency | null {
  if (value === undefined) return "POINTS";
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return upper === "POINTS" || upper === "PESOS" ? upper : null;
}

/**
 * Buys `quantity` seedlings. Stock is reserved for both currencies; POINTS orders are paid now
 * (guarded decrement), PESOS orders are cash on delivery. All-or-nothing: any failure rolls back.
 */
export async function placeSeedlingOrder(userId: string, productId: string, quantity: number, currency: Currency = "POINTS") {
  return prisma.$transaction(async (tx) => {
    const product = await tx.seedlingProduct.findUnique({
      where: { id: productId },
      include: { species: { select: { name: true } } },
    });
    if (!product || !product.isActive) throw new OrderError("This seedling is not available.", 404);
    if (currency === "PESOS" && product.priceInPesos <= 0) {
      throw new OrderError(`${product.species.name} seedlings can't be bought with pesos.`, 400);
    }

    const totalPrice =
      currency === "PESOS" ? toCentavos(product.priceInPesos * quantity) : product.priceInPoints * quantity;

    const stock = await tx.seedlingProduct.updateMany({
      where: { id: productId, isActive: true, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (!stock.count) throw new OrderError(`Only ${product.stockQuantity} ${product.species.name} seedlings left.`, 409);

    if (currency === "POINTS") {
      const paid = await tx.user.updateMany({
        where: { id: userId, points: { gte: totalPrice } },
        data: { points: { decrement: totalPrice } },
      });
      if (!paid.count) throw new OrderError(`You need ${formatPoints(totalPrice)} for this order.`, 402);
    }

    const order = await tx.order.create({ data: { userId, productId, quantity, totalPrice, currencyUsed: currency } });
    const what = plural(quantity, product.species.name);
    await recordTransaction(tx, {
      userId,
      kind: "SEEDLING_ORDER",
      currency,
      amount: totalPrice,
      description: what,
      orderId: order.id,
    });
    await notify(
      tx,
      userId,
      currency === "PESOS"
        ? `Order placed: ${what} — pay ${formatPesos(totalPrice)} cash on delivery.`
        : `Order placed: ${what} for ${formatPoints(totalPrice)}.`,
      "/transactions",
    );
    return order;
  });
}

// ─── Admin: inventory & order fulfilment ────────────────────────────────────

type ProductUpdate = Partial<{ priceInPoints: number; priceInPesos: number; stockQuantity: number; isActive: boolean }>;

/** Validates an admin inventory edit; only provided fields are returned. */
export function parseProductUpdate(body: Record<string, unknown>): { ok: true; data: ProductUpdate } | { ok: false; error: string } {
  const data: ProductUpdate = {};
  const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

  if (body.priceInPoints !== undefined) {
    if (!int(body.priceInPoints, 1, MAX_PRICE_POINTS)) {
      return { ok: false, error: `Points price must be a whole number from 1 to ${MAX_PRICE_POINTS.toLocaleString("en-PH")}.` };
    }
    data.priceInPoints = body.priceInPoints as number;
  }
  if (body.priceInPesos !== undefined) {
    const v = body.priceInPesos;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_PRICE_PESOS || toCentavos(v) !== v) {
      return { ok: false, error: "Peso price must be 0 (not sold for pesos) or an amount with at most 2 decimals." };
    }
    data.priceInPesos = v;
  }
  if (body.stockQuantity !== undefined) {
    if (!int(body.stockQuantity, 0, MAX_STOCK)) return { ok: false, error: "Stock must be a whole number, 0 or more." };
    data.stockQuantity = body.stockQuantity as number;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") return { ok: false, error: "isActive must be true or false." };
    data.isActive = body.isActive;
  }
  if (!Object.keys(data).length) return { ok: false, error: "Nothing to update." };
  return { ok: true, data };
}

/** The next fulfilment step for each status (admin "advance" action). */
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "PACKED",
  PACKED: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};
/** Orders can be cancelled until they leave for delivery. */
export const CANCELLABLE: OrderStatus[] = ["PENDING", "PACKED"];

const STATUS_MESSAGES: Partial<Record<OrderStatus, string>> = {
  PACKED: "is packed and getting ready to ship",
  OUT_FOR_DELIVERY: "is out for delivery",
  DELIVERED: "was delivered — happy planting! 🌱",
};

/**
 * Admin: moves an order one step along PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED, or
 * cancels it (restocking, and refunding points for POINTS orders). Guarded on the current
 * status so double clicks or two admins can't apply the same step twice.
 */
export async function updateOrderStatus(orderId: string, action: "advance" | "cancel") {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { product: { select: { species: { select: { name: true } } } } },
    });
    if (!order) throw new OrderError("Order not found.", 404);

    const next = action === "cancel" ? (CANCELLABLE.includes(order.status) ? "CANCELLED" : undefined) : NEXT_ORDER_STATUS[order.status];
    if (!next) {
      throw new OrderError(
        action === "cancel" ? "Only pending or packed orders can be cancelled." : "This order has no further steps.",
        409,
      );
    }

    const { count } = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: next } });
    if (!count) throw new OrderError("This order was just updated by someone else. Refresh and try again.", 409);

    const what = plural(order.quantity, order.product.species.name);
    if (next === "CANCELLED") {
      await tx.seedlingProduct.update({ where: { id: order.productId }, data: { stockQuantity: { increment: order.quantity } } });
      if (order.currencyUsed === "POINTS") {
        await tx.user.update({ where: { id: order.userId }, data: { points: { increment: order.totalPrice } } });
        await recordTransaction(tx, {
          userId: order.userId,
          kind: "REFUND",
          currency: "POINTS",
          amount: order.totalPrice,
          description: `Refund: ${what} order cancelled`,
          orderId: order.id,
        });
      }
      await notify(
        tx,
        order.userId,
        `Your order for ${what} was cancelled${order.currencyUsed === "POINTS" ? ` — ${formatPoints(order.totalPrice)} refunded` : ""}.`,
        "/transactions",
      );
    } else {
      await notify(tx, order.userId, `Your order for ${what} ${STATUS_MESSAGES[next]}.`, "/transactions");
    }

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  });
}
