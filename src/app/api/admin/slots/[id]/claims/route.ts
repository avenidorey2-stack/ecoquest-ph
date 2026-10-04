import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { listSlotClaims } from "@/lib/admin-slots";

// GET /api/admin/slots/:id/claims — planters with a quest in progress here and their claim deadlines.
export async function GET(_req: Request, { params }: RouteContext<"/api/admin/slots/[id]/claims">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ claims: await listSlotClaims(id) });
}
