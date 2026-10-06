import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { searchCities } from "@/lib/psgc";

// GET /api/admin/geo/places?q=… — cities/municipalities by name, for the slot map's search box.
export async function GET(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 60);
  return NextResponse.json({ results: searchCities(q) });
}
