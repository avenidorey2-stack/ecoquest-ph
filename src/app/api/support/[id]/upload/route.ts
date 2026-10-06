import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { startChatUpload } from "@/lib/chat-attachments";
import { canUseTicket, supportScope } from "@/lib/support";

// POST /api/support/:id/upload — JSON `{ type, size }` of a photo/video to attach. Returns
// `{ upload: { url, key, token } }`: the browser PUTs the file to `url`, then sends `{ key, token }`
// with the message. `{ upload: null }` means local-disk storage: post the file with the message.
export async function POST(req: Request, { params }: RouteContext<"/api/support/[id]/upload">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await canUseTicket(id, user))) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const result = await startChatUpload(user.id, supportScope(id, user.id), await req.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ upload: result.upload });
}
