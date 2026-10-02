import { NextResponse } from "next/server";
import { resetPassword } from "@/lib/password-reset";
import { clientIp } from "@/lib/rate-limit";

// POST /api/password/reset — body: { token, password } — sets a new password via an emailed link.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await resetPassword({ token: body.token, password: body.password, ip: clientIp(req) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, email: result.email });
}
