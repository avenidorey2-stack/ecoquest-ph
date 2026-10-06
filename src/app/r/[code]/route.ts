import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { REFERRAL_COOKIE } from "@/lib/referrals";

// GET /r/:code — public invite link. Remembers the code through sign-up, then lands on the Referral Hub.
export async function GET(req: Request, { params }: RouteContext<"/r/[code]">) {
  const { code } = await params;
  const exists = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });

  const hub = `/referrals${exists ? `?code=${encodeURIComponent(code)}` : ""}`;
  const me = await getCurrentUser();
  const target = me ? hub : `/signup?callbackUrl=${encodeURIComponent(hub)}`;

  const res = NextResponse.redirect(new URL(target, req.url));
  if (exists) {
    res.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return res;
}
