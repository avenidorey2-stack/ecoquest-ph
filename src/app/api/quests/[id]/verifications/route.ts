import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  deleteMedia,
  isValidUploadToken,
  mediaUrlForKey,
  saveMedia,
  verifyDirectUpload,
  type StoredMedia,
} from "@/lib/storage";
import { isSlotOpen, MAX_PLANTS_PER_SUBMISSION, SLOT_CLOSED } from "@/lib/quests";
import { notifyAdmins } from "@/lib/notifications";

function plantCountError(plantCount: number) {
  if (Number.isInteger(plantCount) && plantCount >= 1 && plantCount <= MAX_PLANTS_PER_SUBMISSION) return null;
  return NextResponse.json({ error: `Plant count must be between 1 and ${MAX_PLANTS_PER_SUBMISSION}.` }, { status: 400 });
}

/** The quest, if it's the user's and awaiting proof; otherwise the error response. */
async function activeQuest(questId: string, userId: string) {
  const quest = await prisma.quest.findUnique({
    where: { id: questId },
    select: { userId: true, status: true, slot: { select: { status: true, deletedAt: true } } },
  });
  if (!quest || quest.userId !== userId) {
    return { response: NextResponse.json({ error: "Quest not found." }, { status: 404 }) };
  }
  if (!isSlotOpen(quest.slot)) {
    return { response: NextResponse.json({ error: SLOT_CLOSED }, { status: 409 }) };
  }
  if (quest.status !== "ACTIVE") {
    return { response: NextResponse.json({ error: "This quest is not awaiting proof." }, { status: 409 }) };
  }
  return { response: null };
}

/** Records the submission; cleans up the stored file if that fails. */
async function createVerification(questId: string, media: StoredMedia, plantCount: number) {
  try {
    const verification = await prisma.$transaction(async (tx) => {
      // Shared lock on the slot first: an admin closing it at this moment either finishes first
      // (then the check below refuses) or waits for this submission (then reviews it as pending).
      await tx.$queryRaw`
        SELECT 1 FROM "Slot" s JOIN "Quest" q ON q."slotId" = s."id" WHERE q."id" = ${questId} FOR SHARE OF s`;
      // Guarded transition so concurrent submissions can't both succeed, and none land on a
      // closed slot. The quest's own plantCount is its approved progress; this submission's count
      // is stored on the verification and added to the progress when it's approved.
      const { count } = await tx.quest.updateMany({
        where: { id: questId, status: "ACTIVE", slot: { status: { not: "CLOSED" }, deletedAt: null } },
        data: { status: "PENDING_VERIFICATION" },
      });
      if (count === 0) return null;
      const created = await tx.verification.create({
        data: { questId, mediaUrl: media.url, mediaType: media.type, plantCount },
      });

      // Tell the admins there's proof to review (same transaction: no notice without the proof).
      const { userId, user, slot } = await tx.quest.findUniqueOrThrow({
        where: { id: questId },
        select: { userId: true, user: { select: { name: true } }, slot: { select: { requiredPlantType: true, city: true } } },
      });
      await notifyAdmins(
        tx,
        `New proof to review: ${user.name?.trim() || "A planter"} submitted ${plantCount} ${slot.requiredPlantType} in ${slot.city}.`,
        "/admin/verifications",
        userId,
      );
      return created;
    });

    if (!verification) {
      await deleteMedia(media.key);
      return NextResponse.json({ error: "This quest is not awaiting proof." }, { status: 409 });
    }
    return NextResponse.json({ verification }, { status: 201 });
  } catch (err) {
    // Never delete a file another submission already points at.
    if ((await prisma.verification.count({ where: { mediaUrl: media.url } })) === 0) await deleteMedia(media.key);
    throw err;
  }
}

// POST /api/quests/:id/verifications
//  • JSON `{ key, token, plantCount }` — the file was uploaded straight to storage via
//    POST /api/quests/:id/verifications/upload (production, Supabase).
//  • multipart form: `file` (photo/video) + `plantCount` — local-disk storage (dev, tests).
export async function POST(req: Request, { params }: RouteContext<"/api/quests/[id]/verifications">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { id: questId } = await params;

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { key?: unknown; token?: unknown; plantCount?: unknown } | null;
    const key = typeof body?.key === "string" ? body.key : "";
    const token = typeof body?.token === "string" ? body.token : "";
    const plantCount = Number(body?.plantCount);

    if (!key || !token || !isValidUploadToken(questId, key, token)) {
      return NextResponse.json({ error: "Upload expired or invalid. Please try again." }, { status: 400 });
    }
    const badCount = plantCountError(plantCount);
    if (badCount) return badCount;

    const quest = await activeQuest(questId, user.id);
    if (quest.response) return quest.response;
    if (await prisma.verification.findUnique({ where: { mediaUrl: mediaUrlForKey(key) }, select: { id: true } })) {
      return NextResponse.json({ error: "This upload was already submitted. Please upload the file again." }, { status: 409 });
    }

    const checked = await verifyDirectUpload(key).catch((err) => {
      console.error("Proof upload check failed:", err);
      return null;
    });
    if (!checked) return NextResponse.json({ error: "Couldn't check your upload. Please try again." }, { status: 502 });
    if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    return createVerification(questId, checked.media, plantCount);
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const plantCount = Number(form?.get("plantCount"));

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a photo or video as proof." }, { status: 400 });
  }
  const badCount = plantCountError(plantCount);
  if (badCount) return badCount;

  const quest = await activeQuest(questId, user.id);
  if (quest.response) return quest.response;

  let media;
  try {
    media = await saveMedia(file);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return createVerification(questId, media, plantCount);
}
