import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { deleteComment } from "@/lib/photo-social";

// DELETE /api/comments/:id — by its author, the photo's owner, or an admin.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/comments/[id]">) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await deleteComment(id, viewer);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
