import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isWithinUserCity } from "@/lib/geo";

const ACTIVE_QUEST_STATUSES = ["ACTIVE", "PENDING_VERIFICATION"] as const;

// GET /api/slots[?scope=city|all] — open/full slots with a per-user `claimable` flag.
// scope=city limits results to the user's home city (none if no city is set).
// scope=all (admins only) returns every slot nationwide, closed ones included.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const scope = new URL(req.url).searchParams.get("scope");
  const cityOnly = scope === "city";

  // Role from the DB (not the JWT) so demotions apply immediately.
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { cityCode: true, role: true } });
  if (scope === "all" && user?.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (cityOnly && !user?.cityCode) return NextResponse.json({ slots: [] });

  const slots = await prisma.slot.findMany({
    where: {
      deletedAt: null,
      ...(scope === "all" ? {} : { status: { in: ["OPEN", "FULL"] } }),
      ...(cityOnly ? { cityCode: user!.cityCode! } : {}),
    },
    include: {
      _count: {
        select: { quests: { where: { status: { in: [...ACTIVE_QUEST_STATUSES] } } } },
      },
      quests: {
        where: { userId: session.user.id, status: { in: [...ACTIVE_QUEST_STATUSES] } },
        select: { id: true },
      },
    },
  });

  return NextResponse.json({
    slots: slots.map(({ _count, quests, ...slot }) => ({
      ...slot,
      participants: _count.quests,
      spotsLeft: Math.max(0, slot.maxParticipants - _count.quests),
      alreadyClaimed: quests.length > 0,
      claimable:
        slot.status === "OPEN" &&
        _count.quests < slot.maxParticipants &&
        quests.length === 0 &&
        !!user &&
        isWithinUserCity(user, slot),
    })),
  });
}
