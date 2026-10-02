import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { isInsidePhilippines, reverseGeocode } from "@/lib/geo";
import { matchCity, resolveCity } from "@/lib/psgc";

// GET /api/admin/geo/reverse?lat=..&lng=.. — best-effort PSGC place (+ barangay) for a new pin.
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInsidePhilippines(lat, lng)) {
    return NextResponse.json({ error: "Point must be inside the Philippines." }, { status: 400 });
  }

  const names = await reverseGeocode(lat, lng);
  const cityCode = names ? matchCity(names) : null;
  return NextResponse.json({ place: resolveCity(cityCode), barangay: names?.barangay || null, osm: names });
}
