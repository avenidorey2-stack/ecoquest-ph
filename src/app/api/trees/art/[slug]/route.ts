import { NextResponse } from "next/server";
import { TREE_SPECIES } from "@/data/tree-species";
import { renderTreeSvg } from "@/lib/tree-art";
import { treePhoto } from "@/data/tree-photos";

const BY_SLUG = new Map(TREE_SPECIES.map((s) => [s.slug, s]));

// GET /api/trees/art/:slug — the species photo (a redirect to its card-size file), or a generated
// illustration for species without one. Public and cacheable; TreeSpecies.imageUrl points here.
export async function GET(req: Request, { params }: RouteContext<"/api/trees/art/[slug]">) {
  const { slug } = await params;
  const species = BY_SLUG.get(slug);
  if (!species) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const photo = treePhoto(slug);
  if (photo) {
    const res = NextResponse.redirect(new URL(photo.card, req.url), 307);
    res.headers.set("Cache-Control", "public, max-age=86400");
    return res;
  }

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
