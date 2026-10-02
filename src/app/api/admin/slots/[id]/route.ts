import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseSlotUpdate } from "@/lib/slots";
import { slotSpeciesFromInput } from "@/lib/species";
import { deleteSlotPermanently } from "@/lib/admin-slots";

// PATCH /api/admin/slots/:id — edit slot rules (species, points, status, place names).
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/slots/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const species = await slotSpeciesFromInput(prisma, body);
  if (!species.ok) return NextResponse.json({ error: species.error }, { status: 400 });

  const parsed = parseSlotUpdate({ ...body, ...(species.requiredPlantType ? { requiredPlantType: species.requiredPlantType } : {}) });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const data = { ...parsed.data, ...(species.speciesId !== undefined ? { speciesId: species.speciesId } : {}) };
  const { count } = await prisma.slot.updateMany({ where: { id, deletedAt: null }, data });
  if (count === 0) return NextResponse.json({ error: "Slot not found." }, { status: 404 });

  return NextResponse.json({ slot: await prisma.slot.findUnique({ where: { id } }) });
}

// DELETE /api/admin/slots/:id — deletes a slot that has no quests.
// DELETE /api/admin/slots/:id?permanent=true — removes any slot for good and cancels its
// in-progress quests; approved proof and planted trees stay on planters' profiles (see
// deleteSlotPermanently). Without the flag, slots with history are refused (409).
export async function DELETE(req: Request, { params }: RouteContext<"/api/admin/slots/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  if (new URL(req.url).searchParams.get("permanent") === "true") {
    const result = await deleteSlotPermanently(id);
    if (!result) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
    return NextResponse.json({ deleted: true, ...result });
  }

  // Guarded delete: the "no quests" condition is checked by the same statement that deletes.
  const { count } = await prisma.slot.deleteMany({ where: { id, quests: { none: {} } } });
  if (count) return NextResponse.json({ deleted: true });

  const exists = await prisma.slot.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Slot not found." }, { status: 404 });
  return NextResponse.json(
    { error: "This slot has planting history. Close it to hide it from the map, or delete it permanently." },
    { status: 409 },
  );
}
