import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { unsendSupportMessage } from "@/lib/support";

// DELETE /api/support/:id/messages/:messageId — the author unsends their own message.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/support/[id]/messages/[messageId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, messageId } = await params;
  const result = await unsendSupportMessage(id, messageId, user);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
