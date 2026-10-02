import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { mediaUrlForKey, readMedia } from "@/lib/storage";

// GET /api/media/:key — proof media. Pending/rejected proof is visible only to its owner and
// admins; approved proof is also visible to any signed-in user (leaderboard profile gallery).
export async function GET(_req: Request, { params }: RouteContext<"/api/media/[key]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;

  const verification = await prisma.verification.findUnique({
    where: { mediaUrl: mediaUrlForKey(key) },
    select: { mediaType: true, status: true, quest: { select: { userId: true } } },
  });
  const allowed =
    !!verification &&
    (verification.status === "APPROVED" || verification.quest.userId === user.id || user.role === "ADMIN");
  if (!verification || !allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await readMedia(key);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": verification.mediaType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
