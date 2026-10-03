import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { mediaRuleError } from "@/lib/media-rules";
import { hitRateLimit } from "@/lib/rate-limit";
import { createDirectUpload } from "@/lib/storage";
import { isSlotOpen, SLOT_CLOSED } from "@/lib/quests";

const UPLOADS_PER_HOUR = 30;

// POST /api/quests/:id/verifications/upload — JSON `{ type, size }` of the proof file.
// Returns `{ upload: { url, key, token } }`: the browser PUTs the file to `url` (straight to
// Supabase Storage, skipping Vercel's 4.5 MB request limit), then submits `{ key, token }` to
// POST /api/quests/:id/verifications. `{ upload: null }` means local-disk storage: post the
// file itself to that route instead.
export async function POST(req: Request, { params }: RouteContext<"/api/quests/[id]/verifications/upload">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { id: questId } = await params;

  const body = (await req.json().catch(() => null)) as { type?: unknown; size?: unknown } | null;
  const type = typeof body?.type === "string" ? body.type : "";
  const size = Number(body?.size);
  if (!Number.isInteger(size) || size <= 0) {
    return NextResponse.json({ error: "Attach a photo or video as proof." }, { status: 400 });
  }
  const problem = mediaRuleError({ type, size });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const quest = await prisma.quest.findUnique({
    where: { id: questId },
    select: { userId: true, status: true, slot: { select: { status: true, deletedAt: true } } },
  });
  if (!quest || quest.userId !== user.id) return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  if (!isSlotOpen(quest.slot)) return NextResponse.json({ error: SLOT_CLOSED }, { status: 409 });
  if (quest.status !== "ACTIVE") return NextResponse.json({ error: "This quest is not awaiting proof." }, { status: 409 });

  // Each signed URL lets the browser store up to 50 MB: cap how many one account can request.
  if (!(await hitRateLimit(`proof-upload:${user.id}`, UPLOADS_PER_HOUR, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many uploads. Please try again in an hour." }, { status: 429 });
  }

  try {
    return NextResponse.json({ upload: await createDirectUpload(questId, type) });
  } catch (err) {
    console.error("Proof upload signing failed:", err);
    return NextResponse.json({ error: "Couldn't start the upload. Please try again." }, { status: 502 });
  }
}
