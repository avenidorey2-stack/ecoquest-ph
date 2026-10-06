import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { updateSettings } from "@/lib/account-settings";

// PATCH /api/settings { photoVisibility?, notifyFriendRequests?, notifyLikes?, notifyComments?, showActiveStatus? }
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await updateSettings(user.id, body as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ settings: result.settings });
}
