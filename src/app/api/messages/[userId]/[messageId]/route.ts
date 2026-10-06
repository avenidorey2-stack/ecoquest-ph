import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { unsendDirectMessage } from "@/lib/messages";

// DELETE /api/messages/:userId/:messageId — the sender unsends their message (for both people).
export async function DELETE(_req: Request, { params }: RouteContext<"/api/messages/[userId]/[messageId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await unsendDirectMessage(user.id, (await params).messageId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
