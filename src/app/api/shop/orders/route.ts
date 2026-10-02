import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import {
  MAX_ORDER_QUANTITY,
  OrderError,
  parseCurrency,
  parseOrderQuantity,
  placeSeedlingOrder,
} from "@/lib/seedlings";

// POST /api/shop/orders — body: { productId: string, quantity: number (1–50), currency?: "POINTS" | "PESOS" }
// POINTS deducts points now; PESOS is cash on delivery. Both reserve stock and record the order.
export async function POST(req: Request) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  const quantity = parseOrderQuantity(body.quantity);
  const currency = parseCurrency(body.currency);
  if (typeof body.productId !== "string" || !body.productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }
  if (quantity === null) {
    return NextResponse.json({ error: `Quantity must be a whole number from 1 to ${MAX_ORDER_QUANTITY}.` }, { status: 400 });
  }
  if (currency === null) {
    return NextResponse.json({ error: 'currency must be "POINTS" or "PESOS".' }, { status: 400 });
  }

  try {
    const order = await placeSeedlingOrder(user.id, body.productId, quantity, currency);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
