import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { cityOutlineOrPoint } from "@/lib/city-boundary";
import { resolveCity } from "@/lib/psgc";

// GET /api/admin/geo/boundary?cityCode=… — outline (or, failing that, center point) of any
// city/municipality, so the slot map can zoom to it.
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const place = resolveCity(new URL(req.url).searchParams.get("cityCode"));
  if (!place) return NextResponse.json({ error: "Unknown city or municipality." }, { status: 404 });
  return NextResponse.json({ city: place.city, ...(await cityOutlineOrPoint(place)) });
}
