import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { markAway, touchActive } from "@/lib/messages";

// POST /api/presence { state: "away" | "active" } — the app was left (tab closed or hidden,
// phone locked) or opened again. "away" is sent with navigator.sendBeacon as the page goes, so
// friends see "Active 1m ago" right away instead of "Active Now" for a few more minutes.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { state?: unknown } | null;
  if (body?.state === "away") await markAway(user.id);
  else if (body?.state === "active") await touchActive(user.id);
  else return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
