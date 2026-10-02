import { NextResponse } from "next/server";
import { EmailDeliveryError } from "@/lib/email";
import { clientIp } from "@/lib/rate-limit";
import { startRegistration } from "@/lib/registration";
import { originFromRequest } from "@/lib/url";

// POST /api/register — body: { name, email, website? } — emails a confirmation link.
// Always answers the same way for valid input, so it can't reveal which emails have accounts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Honeypot: the "website" field is hidden from people; bots that fill it get a fake success.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  try {
    const result = await startRegistration({
      name: body.name,
      email: body.email,
      ip: clientIp(req),
      origin: originFromRequest(req),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (!(err instanceof EmailDeliveryError)) throw err; // a real bug — don't disguise it as an email outage
    console.error("Sign-up email failed", err);
    return NextResponse.json(
      { error: "We couldn't send the confirmation email right now. Please try again in a few minutes." },
      { status: 503 },
    );
  }
}
