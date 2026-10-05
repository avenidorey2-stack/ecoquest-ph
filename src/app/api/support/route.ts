import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { hitRateLimit } from "@/lib/rate-limit";
import { createTicket } from "@/lib/support";

// POST /api/support { subject, body } — report a problem to the team.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hitRateLimit(`support-ticket:${user.id}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "You've sent several reports — please wait a bit before sending another." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { subject?: unknown; body?: unknown } | null;
  const result = await createTicket(user.id, body?.subject, body?.body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
