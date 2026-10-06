import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { liftRestriction } from "@/lib/moderation";

// DELETE /api/admin/restrictions/:userId — end a suspension or ban early.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/admin/restrictions/[userId]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { userId } = await params;
  if (!(await liftRestriction(userId))) return NextResponse.json({ error: "That account isn't suspended or banned." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
