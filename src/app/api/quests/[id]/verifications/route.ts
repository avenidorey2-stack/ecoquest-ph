import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { deleteMedia, saveMedia } from "@/lib/storage";
import { MAX_PLANTS_PER_SUBMISSION } from "@/lib/quests";

// POST /api/quests/:id/verifications — multipart form: `file` (photo/video) + `plantCount`.
export async function POST(req: Request, { params }: RouteContext<"/api/quests/[id]/verifications">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { id: questId } = await params;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const plantCount = Number(form?.get("plantCount"));

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a photo or video as proof." }, { status: 400 });
  }
  if (!Number.isInteger(plantCount) || plantCount < 1 || plantCount > MAX_PLANTS_PER_SUBMISSION) {
    return NextResponse.json(
      { error: `Plant count must be between 1 and ${MAX_PLANTS_PER_SUBMISSION}.` },
      { status: 400 },
    );
  }

  const quest = await prisma.quest.findUnique({ where: { id: questId } });
  if (!quest || quest.userId !== user.id) {
    return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  }
  if (quest.status !== "ACTIVE") {
    return NextResponse.json({ error: "This quest is not awaiting proof." }, { status: 409 });
  }

  let media;
  try {
    media = await saveMedia(file);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const verification = await prisma.$transaction(async (tx) => {
      // Guarded transition so concurrent submissions can't both succeed.
      // The quest's own plantCount is its approved progress; this submission's count is stored
      // on the verification and added to the progress when it's approved.
      const { count } = await tx.quest.updateMany({
        where: { id: questId, status: "ACTIVE" },
        data: { status: "PENDING_VERIFICATION" },
      });
      if (count === 0) return null;
      return tx.verification.create({
        data: { questId, mediaUrl: media.url, mediaType: media.type, plantCount },
      });
    });

    if (!verification) {
      await deleteMedia(media.key);
      return NextResponse.json({ error: "This quest is not awaiting proof." }, { status: 409 });
    }
    return NextResponse.json({ verification }, { status: 201 });
  } catch (err) {
    await deleteMedia(media.key);
    throw err;
  }
}
