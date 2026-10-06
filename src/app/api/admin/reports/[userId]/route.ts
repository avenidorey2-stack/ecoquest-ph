import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { resolveReports } from "@/lib/moderation";

// POST /api/admin/reports/:userId — body: { action: DISMISSED|WARNED|SUSPENDED|BANNED, days?, note? }
// Decides every open report about this planter at once.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/reports/[userId]">) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await resolveReports({ adminId: admin.id, reportedId: userId, action: body.action, days: body.days, note: body.note });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, resolved: result.resolved });
}
