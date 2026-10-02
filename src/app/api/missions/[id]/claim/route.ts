import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { claimMission, MissionError } from "@/lib/missions";

// POST /api/missions/:id/claim — claim a daily/side quest reward once its target is met.
export async function POST(_req: Request, { params }: RouteContext<"/api/missions/[id]/claim">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { id } = await params;
  try {
    return NextResponse.json(await claimMission(user.id, id), { status: 201 });
  } catch (err) {
    if (err instanceof MissionError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
