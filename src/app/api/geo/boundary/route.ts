import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fetchCityBoundary } from "@/lib/geo";
import { geocoderCityName, resolveCity } from "@/lib/psgc";

// GET /api/geo/boundary — GeoJSON boundary of the signed-in user's city.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { cityCode: true },
  });
  const place = resolveCity(user?.cityCode);
  if (!place) return NextResponse.json({ city: null, geometry: null });

  // Pseudo-provinces ("Metro Manila", "Independent cities") aren't real provinces — omit those.
  const province = place.provinceCode.endsWith("-X") ? null : place.province;
  // "Region VII (Central Visayas)" → "Central Visayas", as OSM writes it in addresses.
  const regionHint = place.region.match(/\(([^)]+)\)/)?.[1] ?? place.region;
  const geometry = await fetchCityBoundary(geocoderCityName(place.city), province, regionHint);
  return NextResponse.json({ city: place.city, geometry });
}
