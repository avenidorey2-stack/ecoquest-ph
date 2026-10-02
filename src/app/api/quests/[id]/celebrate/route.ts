import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/quests/:id/celebrate — mark the growing-tree celebration as seen.
export async function POST(_req: Request, { params }: RouteContext<"/api/quests/[id]/celebrate">) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  await prisma.quest.updateMany({
    where: { id, userId: session.user.id, status: "COMPLETED", celebratedAt: null },
    data: { celebratedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
