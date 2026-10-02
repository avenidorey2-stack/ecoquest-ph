import { NextResponse } from "next/server";
import { TREE_SPECIES } from "@/data/tree-species";
import { renderTreeSvg } from "@/lib/tree-art";

const BY_SLUG = new Map(TREE_SPECIES.map((s) => [s.slug, s]));

// GET /api/trees/art/:slug — generated illustration for a tree species (public, cacheable).
export async function GET(_req: Request, { params }: RouteContext<"/api/trees/art/[slug]">) {
  const { slug } = await params;
  const species = BY_SLUG.get(slug);
  if (!species) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(renderTreeSvg(species.art, species.name), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      // Served as an image, but lock it down in case it's opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
