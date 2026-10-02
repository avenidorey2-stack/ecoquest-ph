import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseReward } from "@/lib/rewards";

// POST /api/admin/rewards — add a reward to the catalogue.
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parseReward(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { rewardType, brand, costPoints, valuePesos, isActive } = parsed.data;
  const reward = await prisma.reward.create({
    data: { rewardType: rewardType!, brand: brand!, costPoints: costPoints!, valuePesos: valuePesos!, isActive },
  });
  return NextResponse.json({ reward }, { status: 201 });
}
