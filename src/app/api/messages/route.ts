import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { listConversations } from "@/lib/messages";

// GET /api/messages — the signed-in user's chats, latest first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ conversations: await listConversations(user.id) });
}
