import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { acceptRequest, deleteRequest } from "@/lib/messages";

// POST /api/messages/:userId/request — accept that planter's message request (it becomes a chat).
export async function POST(_req: Request, { params }: RouteContext<"/api/messages/[userId]/request">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { userId } = await params;
  const result = await acceptRequest(user.id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ accepted: true });
}

// DELETE /api/messages/:userId/request — delete that planter's message request (hidden for you
// until they send something new; the sender isn't told).
export async function DELETE(_req: Request, { params }: RouteContext<"/api/messages/[userId]/request">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { userId } = await params;
  const result = await deleteRequest(user.id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ deleted: true });
}
