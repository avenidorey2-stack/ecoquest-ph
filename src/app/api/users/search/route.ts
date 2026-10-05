import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { searchPlanters } from "@/lib/friends";

// GET /api/users/search?q=… — planters by name for the header search bar, with friend states.
export async function GET(req: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchPlanters(viewer.id, q) });
}
