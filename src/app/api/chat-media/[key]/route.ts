import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isBlockedEitherWay } from "@/lib/blocks";
import { chatMedia } from "@/lib/storage";
import { parseRange } from "@/lib/http-range";

/** The file's type, if `user` may see it: a member of its chat, or the report's owner / the team. */
async function allowedType(key: string, user: { id: string; role: string }) {
  const dm = await prisma.directMessage.findUnique({
    where: { mediaKey: key },
    select: { mediaType: true, conversation: { select: { members: { select: { userId: true } } } } },
  });
  if (dm) {
    const ids = dm.conversation.members.map((m) => m.userId);
    if (!ids.includes(user.id)) return null;
    const other = ids.find((id) => id !== user.id);
    return other && (await isBlockedEitherWay(user.id, other)) ? null : dm.mediaType;
  }
  const support = await prisma.supportMessage.findUnique({
    where: { mediaKey: key },
    select: { mediaType: true, ticket: { select: { userId: true } } },
  });
  if (support && (support.ticket.userId === user.id || user.role === "ADMIN")) return support.mediaType;
  return null;
}

// GET /api/chat-media/:key — a photo/video sent in a chat or problem report.
export async function GET(req: Request, { params }: RouteContext<"/api/chat-media/[key]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await params;
  const type = await allowedType(key, user);
  if (!type) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Supabase: send the browser to a short-lived signed link, so large videos stream straight
  // from storage (Vercel caps function responses at 4.5 MB). The access check above still applies.
  const direct = await chatMedia.downloadUrl(key);
  if (direct) {
    return new Response(null, { status: 302, headers: { Location: direct, "Cache-Control": "private, max-age=300" } });
  }

  const data = await chatMedia.read(key);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const headers = {
    "Content-Type": type,
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
      headers: { ...headers, "Content-Length": String(chunk.length), "Content-Range": `bytes ${range.start}-${range.end}/${data.length}` },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
}
