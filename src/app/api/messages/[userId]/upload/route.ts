import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { startChatUpload } from "@/lib/chat-attachments";
import { canMessage, dmScope } from "@/lib/messages";

// POST /api/messages/:userId/upload — JSON `{ type, size }` of a photo/video to send. Returns
// `{ upload: { url, key, token } }`: the browser PUTs the file to `url`, then sends `{ key, token }`
// with the message. `{ upload: null }` means local-disk storage: post the file with the message.
export async function POST(req: Request, { params }: RouteContext<"/api/messages/[userId]/upload">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { userId: otherId } = await params;
  const denied = await canMessage(user.id, otherId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const result = await startChatUpload(user.id, dmScope(user.id, otherId), await req.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ upload: result.upload });
}
