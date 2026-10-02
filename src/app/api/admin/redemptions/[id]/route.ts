import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { recordTransaction } from "@/lib/transactions";

// POST /api/admin/redemptions/:id
// Body: { action: "fulfill" | "reject", note?: string }
// Rejecting refunds pointsSpent, since points are deducted when a redemption is requested.
export async function POST(req: Request, { params }: RouteContext<"/api/admin/redemptions/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  if (body.action !== "fulfill" && body.action !== "reject") {
    return NextResponse.json({ error: 'action must be "fulfill" or "reject".' }, { status: 400 });
  }

  const redemption = await prisma.$transaction(async (tx) => {
    // Guarded update so a request can only be processed once.
    const { count } = await tx.redemptionHistory.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: body.action === "fulfill" ? "FULFILLED" : "REJECTED",
        adminNote: note,
        processedAt: new Date(),
      },
    });
    if (count === 0) return null;

    const updated = await tx.redemptionHistory.findUniqueOrThrow({
      where: { id },
      include: { reward: { select: { brand: true, valuePesos: true } } },
    });
    const label = `₱${updated.reward.valuePesos} ${updated.reward.brand}`;
    if (body.action === "reject") {
      // Refund exactly what was charged — the reward's price may have changed since.
      await tx.user.update({
        where: { id: updated.userId },
        data: { points: { increment: updated.pointsSpent } },
      });
      await recordTransaction(tx, {
        userId: updated.userId,
        kind: "REFUND",
        currency: "POINTS",
        amount: updated.pointsSpent,
        description: `Refund: ${label} request declined`,
        redemptionId: updated.id,
      });
      await notify(tx, updated.userId, `Your ${label} redemption was declined — ${updated.pointsSpent} pts refunded.`, "/rewards");
    } else {
      await notify(tx, updated.userId, `Your ${label} redemption was fulfilled!`, "/rewards");
    }
    return updated;
  });

  if (!redemption) {
    return NextResponse.json({ error: "Redemption not found or already processed." }, { status: 409 });
  }
  return NextResponse.json({ redemption });
}
