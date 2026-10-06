import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// POST /api/onboarding — mark the welcome modal as seen (first time only).
export async function POST() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.user.updateMany({
    where: { id: me.id, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
