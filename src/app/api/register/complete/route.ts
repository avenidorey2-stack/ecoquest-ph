import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { completeRegistration } from "@/lib/registration";
import { attachReferral, REFERRAL_COOKIE } from "@/lib/referrals";

function readCookie(req: Request, name: string) {
  const match = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// POST /api/register/complete — body: { token, name, password } — creates the verified account.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await completeRegistration({
    token: body.token,
    name: body.name,
    password: body.password,
    ip: clientIp(req),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // Sign-ups that started from an invite link (/r/<code>) carry the code in a cookie.
  const code = readCookie(req, REFERRAL_COOKIE);
  if (result.created && code) {
    await attachReferral(result.userId, code).catch((err) => console.error("Referral attach failed", err));
  }
  return NextResponse.json({ ok: true, email: result.email });
}
