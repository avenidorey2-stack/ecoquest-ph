import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { OrderError, updateOrderStatus } from "@/lib/seedlings";

// POST /api/admin/orders/:id — body: { action: "advance" | "cancel" }
// advance: PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED. cancel (pending/packed only):
// restocks, and refunds points for orders paid in points.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/orders/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (body?.action !== "advance" && body?.action !== "cancel") {
    return NextResponse.json({ error: 'action must be "advance" or "cancel".' }, { status: 400 });
  }

  try {
    return NextResponse.json({ order: await updateOrderStatus(id, body.action) });
  } catch (err) {
    if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
