import { NextResponse } from "next/server";
import { getRegionTree } from "@/lib/psgc";

// GET /api/psgc/regions/:code — provinces (with cities/municipalities) in a region.
export async function GET(_req: Request, { params }: RouteContext<"/api/psgc/regions/[code]">) {
  const { code } = await params;
  const provinces = getRegionTree(code);
  if (!provinces) return NextResponse.json({ error: "Unknown region." }, { status: 404 });

  return NextResponse.json(
    { provinces },
    { headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" } },
  );
}
