import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { removeFriend, requestFriend } from "@/lib/friends";

const REQUESTS_PER_HOUR = 40;

// POST /api/friends/:userId — send a friend request, or accept theirs.
export async function POST(_req: Request, { params }: RouteContext<"/api/friends/[userId]">) {
  const { user, response } = await requireVerifiedUser();
  if (!user) return response;
  if (!(await hitRateLimit(`friend-request:${user.id}`, REQUESTS_PER_HOUR, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many friend requests. Please try again in an hour." }, { status: 429 });
  }
  const { userId } = await params;
  const result = await requestFriend(user.id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ state: result.state });
}

// DELETE /api/friends/:userId — cancel a sent request, decline a received one, or unfriend.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/friends/[userId]">) {
  const { user, response } = await requireVerifiedUser();
  if (!user) return response;
  const { userId } = await params;
  const result = await removeFriend(user.id, userId);
  return NextResponse.json({ state: result.ok ? result.state : "NONE" });
}
