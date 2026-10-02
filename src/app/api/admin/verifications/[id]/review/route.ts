import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import {
  approveVerification,
  MAX_PLANTS_PER_SUBMISSION,
  QuestError,
  rejectVerification,
} from "@/lib/quests";

// POST /api/admin/verifications/:id/review
// Body: { action: "approve", plantCount?: number } | { action: "reject", reason?: string }
export async function POST(req: Request, { params }: RouteContext<"/api/admin/verifications/[id]/review">) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    if (body.action === "approve") {
      const override = body.plantCount;
      if (
        override !== undefined &&
        (!Number.isInteger(override) || override < 1 || override > MAX_PLANTS_PER_SUBMISSION)
      ) {
        return NextResponse.json({ error: "Invalid plantCount." }, { status: 400 });
      }
      return NextResponse.json(await approveVerification(id, admin.id, override));
    }
    if (body.action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      return NextResponse.json({ quest: await rejectVerification(id, admin.id, reason) });
    }
    return NextResponse.json({ error: 'action must be "approve" or "reject".' }, { status: 400 });
  } catch (err) {
    if (err instanceof QuestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
