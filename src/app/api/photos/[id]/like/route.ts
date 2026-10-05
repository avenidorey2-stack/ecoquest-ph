import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { setLike } from "@/lib/photo-social";

async function handle(id: Promise<{ id: string }>, like: boolean) {
  const { user, response } = await requireVerifiedUser();
  if (!user) return response;
  if (!(await hitRateLimit(`photo-like:${user.id}`, 200, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Slow down a little and try again." }, { status: 429 });
  }
  const result = await setLike((await id).id, user, like);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ likeCount: result.likeCount, likedByMe: result.likedByMe });
}

// POST /api/photos/:id/like — like. DELETE — unlike.
export const POST = (_req: Request, { params }: RouteContext<"/api/photos/[id]/like">) => handle(params, true);
export const DELETE = (_req: Request, { params }: RouteContext<"/api/photos/[id]/like">) => handle(params, false);
