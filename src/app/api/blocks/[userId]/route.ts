import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { blockUser, unblockUser } from "@/lib/blocks";

// POST /api/blocks/:userId — block a planter (also ends any friendship). DELETE — unblock.
export async function POST(_req: Request, { params }: RouteContext<"/api/blocks/[userId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await blockUser(user.id, (await params).userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ blocked: true });
}

export async function DELETE(_req: Request, { params }: RouteContext<"/api/blocks/[userId]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await unblockUser(user.id, (await params).userId);
  return NextResponse.json({ blocked: false });
}
