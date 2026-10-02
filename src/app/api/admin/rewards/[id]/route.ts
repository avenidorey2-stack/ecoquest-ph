import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseReward } from "@/lib/rewards";

// PATCH /api/admin/rewards/:id — edit cost/value/brand or (de)activate.
// Changing the cost doesn't affect existing redemptions (they store pointsSpent).
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/rewards/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const current = await prisma.reward.findUnique({ where: { id }, select: { rewardType: true } });
  if (!current) return NextResponse.json({ error: "Reward not found." }, { status: 404 });

  const parsed = parseReward(await req.json().catch(() => ({})), { partial: true, current });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const reward = await prisma.reward.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ reward });
}
