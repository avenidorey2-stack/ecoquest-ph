import { NextResponse } from "next/server";
import { requireVerifiedUser } from "@/lib/authz";
import { RedeemError, redeemReward } from "@/lib/rewards";

// POST /api/rewards/:id/redeem — body: { eWalletNumber?: string } (required for GCash/Maya cashouts)
export async function POST(req: Request, { params }: RouteContext<"/api/rewards/[id]/redeem">) {
  const { user, response } = await requireVerifiedUser();
  if (response) return response;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const redemption = await redeemReward(user.id, id, body.eWalletNumber);
    return NextResponse.json({ redemption }, { status: 201 });
  } catch (err) {
    if (err instanceof RedeemError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
