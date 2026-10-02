import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { acknowledgeCelebration, type CelebrationKind } from "@/lib/celebrations";

const KINDS: CelebrationKind[] = ["level", "achievements", "rank"];

// POST /api/celebrations — body: { kind: "level" | "achievements" | "rank" } — mark a popup as seen.
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { kind } = await req.json().catch(() => ({}));
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: 'kind must be "level", "achievements" or "rank".' }, { status: 400 });
  }
  await acknowledgeCelebration(me.id, kind);
  return NextResponse.json({ ok: true });
}
