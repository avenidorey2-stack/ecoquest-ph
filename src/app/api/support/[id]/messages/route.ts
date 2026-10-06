import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { readChatSend, saveWithMedia } from "@/lib/chat-attachments";
import { addMessage, canUseTicket, supportScope } from "@/lib/support";

// POST /api/support/:id/messages — the reporter or an admin adds to the conversation.
//  • JSON `{ body, key?, token? }` — `key` is a photo/video uploaded straight to storage via
//    POST /api/support/:id/upload (production, Supabase).
//  • multipart form: `body` + optional `file` — local-disk storage (dev, tests).
export async function POST(req: Request, { params }: RouteContext<"/api/support/[id]/messages">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hitRateLimit(`support-message:${user.id}`, 60, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "You're sending messages fast — please wait a few minutes." }, { status: 429 });
  }
  const { id } = await params;
  if (!(await canUseTicket(id, user))) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const sent = await readChatSend(req, supportScope(id, user.id));
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
  const result = await saveWithMedia(sent.media, () => addMessage(id, user, sent.body, sent.media));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true }, { status: 201 });
}
