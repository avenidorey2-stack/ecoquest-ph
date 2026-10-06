import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { unreadSummary } from "@/lib/messages";

// GET /api/messages/unread — `{ unread, latest }` for the header's Messages badge and pop-up.
// The app calls it while open, so it also records the user as active.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await unreadSummary(user.id));
}
