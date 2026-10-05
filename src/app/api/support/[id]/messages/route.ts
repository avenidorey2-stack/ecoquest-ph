import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { addMessage } from "@/lib/support";

// POST /api/support/:id/messages { body } — the reporter or an admin adds to the conversation.
export async function POST(req: Request, { params }: RouteContext<"/api/support/[id]/messages">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hitRateLimit(`support-message:${user.id}`, 60, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "You're sending messages fast — please wait a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { body?: unknown } | null;
  const result = await addMessage((await params).id, user, body?.body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true }, { status: 201 });
}
