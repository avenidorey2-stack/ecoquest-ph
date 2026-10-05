import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { addComment } from "@/lib/photo-social";

const COMMENTS_PER_10_MIN = 20;

// POST /api/photos/:id/comments { body, parentId? } — comment on a planting photo, or reply.
export async function POST(req: Request, { params }: RouteContext<"/api/photos/[id]/comments">) {
  const { user, response } = await requireVerifiedUser();
  if (!user) return response;
  const json = (await req.json().catch(() => null)) as { body?: unknown; parentId?: unknown } | null;
  if (!json) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!(await hitRateLimit(`photo-comment:${user.id}`, COMMENTS_PER_10_MIN, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "You're commenting fast — please wait a few minutes." }, { status: 429 });
  }
  const { id } = await params;
  const result = await addComment(id, user, json.body, json.parentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
