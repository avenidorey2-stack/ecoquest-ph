import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseSlotCreate } from "@/lib/slots";
import { slotSpeciesFromInput } from "@/lib/species";
import { notifyCity, slotOnMapPath } from "@/lib/notifications";

// POST /api/admin/slots — create a slot from a map pin. Species: `speciesId` (catalogue) or
// a free-text `requiredPlantType` (linked to the catalogue when it matches a known species).
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const species = await slotSpeciesFromInput(prisma, body);
  if (!species.ok) return NextResponse.json({ error: species.error }, { status: 400 });

  const parsed = parseSlotCreate({ ...body, ...(species.requiredPlantType ? { requiredPlantType: species.requiredPlantType } : {}) });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const slot = await prisma.slot.create({ data: { ...parsed.data, speciesId: species.speciesId ?? null } });
  // Alert planters who live in the slot's city (the only ones the geofence lets claim it).
  // Tapping it opens the dashboard map on this slot, ready to claim.
  await notifyCity(
    prisma,
    slot.cityCode,
    `New planting slot available in ${slot.city}: ${slot.requiredPlantType} · ${slot.pointsPerPlant} pts/plant. Tap to see it on the map.`,
    slotOnMapPath(slot.id),
  );
  return NextResponse.json({ slot }, { status: 201 });
}
