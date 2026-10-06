import { cache } from "react";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isRestricted } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";

/** The session's user row (once per request), including whether they're suspended or banned. */
const sessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, emailVerified: true, suspendedUntil: true, bannedAt: true, moderationReason: true },
  });
});

/**
 * Returns the signed-in user's id, current role and verification status, read from the
 * database (not the JWT) so role changes take effect immediately. A suspended or banned
 * account counts as signed out, so a ban takes effect on the very next request.
 */
export async function getCurrentUser() {
  const user = await sessionUser();
  if (!user || isRestricted(user)) return null;
  return { id: user.id, role: user.role, emailVerified: user.emailVerified };
}

/** The suspension/ban on the session's account, if any (for the sign-in page's message). */
export async function getSessionRestriction() {
  const user = await sessionUser();
  return user && isRestricted(user) ? user : null;
}

/** Sends a signed-out visitor to /login — with the reason, if their account is suspended or banned. */
export async function redirectToLogin(): Promise<never> {
  redirect((await getSessionRestriction()) ? "/login?error=Restricted" : "/login");
}

/**
 * For signed-in pages. Next renders a layout and its page in parallel, so the (app) layout's
 * redirect doesn't stop the page from running — every page must guard itself.
 */
export async function requirePageUserId() {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin();
  return user.id;
}

/**
 * For API routes where points or rewards are at stake: the user must be signed in
 * and have a verified email. Returns the user, or an error response to return as-is.
 */
export async function requireVerifiedUser() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!user.emailVerified) {
    return {
      user: null,
      response: NextResponse.json({ error: "Please verify your email address first." }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function getAdmin() {
  const user = await getCurrentUser();
  return user?.role === "ADMIN" ? user : null;
}

/** For admin pages: 404 for anyone who isn't an admin. Call in every admin page. */
export async function requireAdminPage() {
  const admin = await getAdmin();
  if (!admin) notFound();
  return admin;
}
