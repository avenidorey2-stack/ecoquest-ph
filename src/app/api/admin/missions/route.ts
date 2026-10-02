import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseMission } from "@/lib/missions";

// POST /api/admin/missions — create a daily or side quest.
// Body: { kind, title, description?, objective, target, rewardPoints, rewardXp?, startsAt?, endsAt?, isActive?, sortOrder? }
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = parseMission(body ?? {}, { create: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { kind, title, objective, target, rewardPoints, ...rest } = parsed.data;
  const mission = await prisma.mission.create({ data: { kind: kind!, title: title!, objective: objective!, target: target!, rewardPoints: rewardPoints!, ...rest } });
  return NextResponse.json({ mission }, { status: 201 });
}
