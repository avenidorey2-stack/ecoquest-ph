import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getPhotoThread } from "@/lib/photo-social";

// GET /api/photos/:id — likes and comments on an approved planting photo (if the viewer may see it).
export async function GET(_req: Request, { params }: RouteContext<"/api/photos/[id]">) {
  const viewer = await getCurrentUser();
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await getPhotoThread(id, viewer);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.thread);
}
