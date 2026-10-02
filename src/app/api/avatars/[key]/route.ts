import { NextResponse } from "next/server";
import { readAvatar } from "@/lib/avatars";

// GET /api/avatars/:key — profile pictures are public (they appear on leaderboards).
// Each upload gets a new random key, so responses can be cached forever.
export async function GET(_req: Request, { params }: RouteContext<"/api/avatars/[key]">) {
  const { key } = await params;
  const data = await readAvatar(key);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
