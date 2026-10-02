import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// POST /api/onboarding — mark the welcome modal as seen (first time only).
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.user.updateMany({
    where: { id: session.user.id, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
