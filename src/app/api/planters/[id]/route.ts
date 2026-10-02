import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getPublicProfile } from "@/lib/public-profile";

// GET /api/planters/:id — public planter profile for the leaderboard modal (signed-in users only).
export async function GET(_req: Request, { params }: RouteContext<"/api/planters/[id]">) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const profile = await getPublicProfile(id, viewer.id);
  if (!profile) return NextResponse.json({ error: "Planter not found." }, { status: 404 });
  return NextResponse.json({ profile });
}
