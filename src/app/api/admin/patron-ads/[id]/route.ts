import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parsePatronAd } from "@/lib/patron-ads";

// PATCH /api/admin/patron-ads/:id — edit or (de)activate a banner.
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/patron-ads/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = parsePatronAd(await req.json().catch(() => ({})), { partial: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await prisma.patronAd.updateMany({ where: { id }, data: parsed.data });
  if (count === 0) return NextResponse.json({ error: "Ad not found." }, { status: 404 });
  return NextResponse.json({ ad: await prisma.patronAd.findUnique({ where: { id } }) });
}

// DELETE /api/admin/patron-ads/:id — ads have no history attached, so they can be removed outright.
export async function DELETE(_req: Request, { params }: RouteContext<"/api/admin/patron-ads/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { count } = await prisma.patronAd.deleteMany({ where: { id } });
  if (count === 0) return NextResponse.json({ error: "Ad not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
