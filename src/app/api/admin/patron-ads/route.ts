import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parsePatronAd } from "@/lib/patron-ads";

// POST /api/admin/patron-ads — add a sponsor banner.
export async function POST(req: Request) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parsePatronAd(await req.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { companyName, imageUrl, targetUrl, isActive } = parsed.data;
  const ad = await prisma.patronAd.create({
    data: { companyName: companyName!, imageUrl: imageUrl!, targetUrl: targetUrl!, isActive },
  });
  return NextResponse.json({ ad }, { status: 201 });
}
