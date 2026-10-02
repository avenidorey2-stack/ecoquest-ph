import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { getPlantingImpact } from "@/lib/impact";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";

// GET /api/impact — national vs local (your PSGC city) totals of verified plantings.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cityCode } = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { cityCode: true } });
  const impact = await getPlantingImpact(cityCode);
  return NextResponse.json({ ...impact, city: resolveCity(cityCode)?.city ?? null });
}
