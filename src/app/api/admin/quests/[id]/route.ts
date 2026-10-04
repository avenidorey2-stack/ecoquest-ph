import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { setClaimExpiry } from "@/lib/admin-slots";

// PATCH /api/admin/quests/:id — body { expiresAt: "YYYY-MM-DD" }: the claim now ends at the end
// of that day (Philippine time). Extending an expired claim lets the planter plant there again.
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/quests/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await setClaimExpiry(id, body?.expiresAt);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
