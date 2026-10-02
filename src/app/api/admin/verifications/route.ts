import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// GET /api/admin/verifications — pending submissions, oldest first.
export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const verifications = await prisma.verification.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      quest: {
        select: {
          id: true,
          plantCount: true,
          targetPlants: true,
          user: { select: { id: true, name: true, email: true, city: true } },
          slot: { select: { id: true, city: true, province: true, requiredPlantType: true, pointsPerPlant: true } },
        },
      },
    },
  });
  return NextResponse.json({ verifications });
}
