import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { chatFriends, listConversations } from "@/lib/messages";

// GET /api/messages — the signed-in user's chats (latest first) and friends to start one with.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [conversations, friends] = await Promise.all([listConversations(user.id), chatFriends(user.id)]);
  return NextResponse.json({ conversations, friends });
}
