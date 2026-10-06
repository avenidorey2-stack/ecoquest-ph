import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { removePushSubscription, savePushSubscription } from "@/lib/push";

// POST /api/push <PushSubscription JSON> — this device allowed notifications: push to it.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await savePushSubscription(user.id, await req.json().catch(() => null));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/push { endpoint } — stop pushing to this device.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const result = await removePushSubscription(user.id, body?.endpoint);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
