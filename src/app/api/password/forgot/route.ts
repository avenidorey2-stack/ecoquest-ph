import { NextResponse } from "next/server";
import { EmailDeliveryError } from "@/lib/email";
import { requestPasswordReset } from "@/lib/password-reset";
import { clientIp } from "@/lib/rate-limit";
import { originFromRequest } from "@/lib/url";

// POST /api/password/forgot — body: { email } — emails a reset link if the account exists.
// Always answers the same way for a valid email, so it can't reveal which emails have accounts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const result = await requestPasswordReset({ email: body.email, ip: clientIp(req), origin: originFromRequest(req) });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (!(err instanceof EmailDeliveryError)) throw err; // a real bug — don't disguise it as an email outage
    console.error("Password reset email failed", err);
    return NextResponse.json(
      { error: "We couldn't send the reset email right now. Please try again in a few minutes." },
      { status: 503 },
    );
  }
}
