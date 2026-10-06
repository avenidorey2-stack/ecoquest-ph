import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { fileReport } from "@/lib/moderation";

// POST /api/reports/:userId — body: { reason, details? } — report a planter's profile to the team.
export async function POST(req: Request, { params }: RouteContext<"/api/reports/[userId]">) {
  const { user, response } = await requireVerifiedUser();
  if (!user) return response;
  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await fileReport({ reporterId: user.id, reportedId: userId, reason: body.reason, details: body.details });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, updated: result.updated });
}
