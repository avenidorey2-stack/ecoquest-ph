import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns the signed-in user's id, current role and verification status, read from the
 * database (not the JWT) so role changes take effect immediately.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, emailVerified: true },
  });
}

/**
 * For signed-in pages. Next renders a layout and its page in parallel, so the (app) layout's
 * redirect doesn't stop the page from running — every page must guard itself.
 */
export async function requirePageUserId() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
