import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveCity } from "@/lib/psgc";
import { MAX_NAME_LENGTH, nextLocationChange } from "@/lib/profile";

// PATCH /api/profile — body: { name?: string, cityCode?: string }
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `Name must be 1–${MAX_NAME_LENGTH} characters.` }, { status: 400 });
    }
    data.name = name;
  }

  if (body.cityCode !== undefined) {
    const place = resolveCity(body.cityCode);
    if (!place) return NextResponse.json({ error: "Choose a valid city/municipality." }, { status: 400 });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { cityCode: true, locationUpdatedAt: true },
    });

    if (place.cityCode !== user.cityCode) {
      // First-time setup is free; changes are restricted.
      if (user.cityCode) {
        const activeQuests = await prisma.quest.count({
          where: { userId, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } },
        });
        if (activeQuests > 0) {
          return NextResponse.json(
            { error: "Finish or wait for review of your active quests before changing city." },
            { status: 409 },
          );
        }
        const nextChange = nextLocationChange(user.locationUpdatedAt);
        if (nextChange && nextChange > new Date()) {
          return NextResponse.json(
            {
              error: `You can change your city again on ${nextChange.toLocaleDateString("en-PH", { dateStyle: "long" })}.`,
              nextChange: nextChange.toISOString(),
            },
            { status: 409 },
          );
        }
      }
      Object.assign(data, {
        region: place.region,
        province: place.province,
        city: place.city,
        cityCode: place.cityCode,
        locationUpdatedAt: new Date(),
      });
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { name: true, region: true, province: true, city: true, cityCode: true, locationUpdatedAt: true },
  });
  return NextResponse.json({ user });
}
