import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { readChatSend, saveWithMedia } from "@/lib/chat-attachments";
import { canMessage, dmScope, getThread, sendDirectMessage, SENDS_PER_MINUTE } from "@/lib/messages";

// GET /api/messages/:userId[?before=<messageId>] — a page of the chat with that planter, oldest
// first. The latest page (no `before`) also marks the chat read.
export async function GET(req: Request, { params }: RouteContext<"/api/messages/[userId]">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  const thread = await getThread(user.id, (await params).userId, { before });
  if (!thread) return NextResponse.json({ error: "Planter not found." }, { status: 404 });
  return NextResponse.json(thread);
}

// POST /api/messages/:userId — send a message to a friend.
//  • JSON `{ body, key?, token?, replyTo? }` — `key` is a photo/video uploaded straight to storage via
//    POST /api/messages/:userId/upload (production, Supabase).
//  • multipart form: `body`, `replyTo` + optional `file` — local-disk storage (dev, tests).
export async function POST(req: Request, { params }: RouteContext<"/api/messages/[userId]">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { userId: otherId } = await params;

  const denied = await canMessage(user.id, otherId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
  if (!(await hitRateLimit(`dm:${user.id}`, SENDS_PER_MINUTE, 60 * 1000))) {
    return NextResponse.json({ error: "You're sending messages fast — please wait a moment." }, { status: 429 });
  }

  const sent = await readChatSend(req, dmScope(user.id, otherId));
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  const result = await saveWithMedia(sent.media, () => sendDirectMessage(user.id, otherId, sent.body, sent.media, sent.replyTo));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ message: result.message }, { status: 201 });
}
