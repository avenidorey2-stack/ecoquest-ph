import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { reactToMessage, REACTS_PER_MINUTE } from "@/lib/messages";

type Ctx = RouteContext<"/api/messages/[userId]/[messageId]/reaction">;

async function react(ctx: Ctx, emoji: unknown) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  if (!(await hitRateLimit(`react:${user.id}`, REACTS_PER_MINUTE, 60 * 1000))) {
    return NextResponse.json({ error: "You're reacting fast — please wait a moment." }, { status: 429 });
  }
  const { userId, messageId } = await ctx.params;
  const result = await reactToMessage(user.id, userId, messageId, emoji);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ reactions: result.reactions });
}

// PUT /api/messages/:userId/:messageId/reaction { emoji } — react to a message (or change it).
export async function PUT(req: Request, ctx: Ctx) {
  const body = (await req.json().catch(() => null)) as { emoji?: unknown } | null;
  return react(ctx, body?.emoji ?? "");
}

// DELETE /api/messages/:userId/:messageId/reaction — remove your reaction.
export async function DELETE(_req: Request, ctx: Ctx) {
  return react(ctx, null);
}
