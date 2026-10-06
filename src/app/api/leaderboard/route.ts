import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getLeaderboard } from "@/lib/leaderboard";

// GET /api/leaderboard?scope=local|national — this week's rankings.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(req.url).searchParams.get("scope") ?? "national";
  if (scope !== "local" && scope !== "national") {
    return NextResponse.json({ error: 'scope must be "local" or "national".' }, { status: 400 });
  }

  let cityCode: string | null = null;
  if (scope === "local") {
    const user = await prisma.user.findUnique({ where: { id: me.id }, select: { cityCode: true } });
    cityCode = user?.cityCode ?? null;
    if (!cityCode) {
      return NextResponse.json({ error: "Set your home city to see your local leaderboard." }, { status: 400 });
    }
  }

  const board = await getLeaderboard({ scope, cityCode, viewerId: me.id });
  return NextResponse.json(board);
}
