import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { attachReferral } from "@/lib/referrals";

// POST /api/referrals/claim — body: { code } — enter an invite code after signing up.
export async function POST(req: Request) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const body = await req.json().catch(() => ({}));

  const result = await attachReferral(user.id, body.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ referrer: { name: result.referrer.name } });
}
