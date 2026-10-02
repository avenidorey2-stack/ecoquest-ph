import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { parseProductUpdate } from "@/lib/seedlings";

// PATCH /api/admin/seedlings/:id — body: any of { priceInPoints, priceInPesos, stockQuantity, isActive }
export async function PATCH(req: Request, { params }: RouteContext<"/api/admin/seedlings/[id]">) {
  if (!(await getAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const parsed = parseProductUpdate(body ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await prisma.seedlingProduct.updateMany({ where: { id }, data: parsed.data });
  if (!count) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  return NextResponse.json({ product: await prisma.seedlingProduct.findUnique({ where: { id } }) });
}
