import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { setTicketStatus } from "@/lib/support";

// PATCH /api/admin/support/:id { status: "OPEN" | "CLOSED" } — admins resolve or reopen a report.
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/support/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const result = await setTicketStatus((await params).id, body?.status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
