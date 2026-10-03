import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { mediaDownloadUrl, mediaUrlForKey, readMedia } from "@/lib/storage";
import { parseRange } from "@/lib/http-range";

// GET /api/media/:key — proof media. Pending/rejected proof is visible only to its owner and
// admins; approved proof is also visible to any signed-in user (leaderboard profile gallery).
export async function GET(req: Request, { params }: RouteContext<"/api/media/[key]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;

  const verification = await prisma.verification.findUnique({
    where: { mediaUrl: mediaUrlForKey(key) },
    select: { mediaType: true, status: true, quest: { select: { userId: true } } },
  });
  const allowed =
    !!verification &&
    (verification.status === "APPROVED" || verification.quest.userId === user.id || user.role === "ADMIN");
  if (!verification || !allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Supabase: send the browser to a short-lived signed link, so large videos stream straight
  // from storage (Vercel caps function responses at 4.5 MB). The access check above still applies.
  const direct = await mediaDownloadUrl(key);
  if (direct) {
    return new Response(null, { status: 302, headers: { Location: direct, "Cache-Control": "private, max-age=300" } });
  }

  const data = await readMedia(key);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers = {
    "Content-Type": verification.mediaType,
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  // Safari / iOS only plays video when byte-range requests are honoured (206 Partial Content).
  const range = parseRange(req.headers.get("range"), data.length);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${data.length}` } });
  }
  if (range) {
    const chunk = data.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${data.length}`,
      },
    });
  }

  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
}
