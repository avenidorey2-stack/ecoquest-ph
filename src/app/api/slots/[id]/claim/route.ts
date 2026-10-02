import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { isWithinUserCity } from "@/lib/geo";

class ClaimError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// POST /api/slots/:id/claim — start a quest on a slot inside the user's city.
export async function POST(_req: Request, { params }: RouteContext<"/api/slots/[id]/claim">) {
  const { user: me, response } = await requireVerifiedUser();
  if (response) return response;
  const userId = me.id;
  const { id: slotId } = await params;

  try {
    const quest = await prisma.$transaction(
      async (tx) => {
        const [user, slot] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { cityCode: true } }),
          tx.slot.findUnique({ where: { id: slotId } }),
        ]);

        if (!user?.cityCode) {
          throw new ClaimError("Set your city/municipality in your profile first.", 400);
        }
        if (!slot || slot.deletedAt) throw new ClaimError("Slot not found.", 404);
        if (slot.status !== "OPEN") throw new ClaimError("This slot is not open.", 409);
        if (!isWithinUserCity(user, slot)) {
          throw new ClaimError("You can only claim slots within your city/municipality.", 403);
        }

        const existing = await tx.quest.findFirst({
          where: { userId, slotId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
          select: { id: true },
        });
        if (existing) throw new ClaimError("You already have an active quest on this slot.", 409);

        // Shared slots hold up to maxParticipants planters at once (active or awaiting review).
        const participants = await tx.quest.count({
          where: { slotId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
        });
        if (participants >= slot.maxParticipants) {
          throw new ClaimError(`This slot is full (${slot.maxParticipants} planters). Try another slot.`, 409);
        }

        return tx.quest.create({ data: { userId, slotId, status: "ACTIVE", targetPlants: slot.questGoal } });
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json({ quest }, { status: 201 });
  } catch (err) {
    if (err instanceof ClaimError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Serialization conflict: a concurrent claim won the race.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return NextResponse.json({ error: "Slot is busy, please try again." }, { status: 409 });
    }
    throw err;
  }
}
