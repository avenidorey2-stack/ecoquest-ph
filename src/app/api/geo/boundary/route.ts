import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { cityBoundary } from "@/lib/city-boundary";
import { resolveCity } from "@/lib/psgc";

// GET /api/geo/boundary — GeoJSON boundary of the signed-in user's city.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { cityCode: true },
  });
  const place = resolveCity(user?.cityCode);
  if (!place) return NextResponse.json({ city: null, geometry: null });

  return NextResponse.json({ city: place.city, geometry: await cityBoundary(place) });
}
