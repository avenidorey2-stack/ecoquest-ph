import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { closeMission, parseMission } from "@/lib/missions";

// PATCH /api/admin/missions/:id — edit any field (only provided fields change).
// Turning a live quest off (isActive: false) closes it: it leaves every dashboard and users who had
// progress on it are notified "The quest '<title>' is now closed." (see closeMission).
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/missions/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = parseMission(body ?? {}, { create: false });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const existing = await prisma.mission.findUnique({ where: { id }, select: { startsAt: true, endsAt: true, isActive: true } });
  if (!existing) return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  const startsAt = parsed.data.startsAt ?? existing.startsAt;
  const endsAt = parsed.data.endsAt !== undefined ? parsed.data.endsAt : existing.endsAt;
  if (endsAt && endsAt <= startsAt) return NextResponse.json({ error: "End date must be after the start date." }, { status: 400 });

  const { isActive, ...fields } = parsed.data;
  const closing = isActive === false && existing.isActive;
  // Apply the other edits first, so a closure notice uses the latest title.
  const data = closing ? fields : parsed.data;
  if (Object.keys(data).length) await prisma.mission.update({ where: { id }, data });
  const { notified } = closing ? await closeMission(id) : { notified: 0 };

  return NextResponse.json({ mission: await prisma.mission.findUnique({ where: { id } }), notified });
}

// DELETE /api/admin/missions/:id — removes the quest. Rewards already claimed stay with the users.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/admin/missions/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { count } = await prisma.mission.deleteMany({ where: { id } });
  if (!count) return NextResponse.json({ error: "Quest not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
