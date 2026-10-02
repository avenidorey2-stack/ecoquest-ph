import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { hitRateLimit } from "@/lib/rate-limit";
import { findUserByEmail, hashToken, normalizeEmail, passwordProblem } from "@/lib/registration";

// "Forgot password" flow:
//   1. requestPasswordReset(email) → emails a single-use link (1 hour) if the account exists
//   2. the link opens /reset-password, where the user picks a new password
//   3. resetPassword(token, password) → updates the hash, consumes every reset link for that user
// Responses never reveal whether an email is registered.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const RESET_IP_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
export const RESET_EMAIL_LIMIT = { limit: 3, windowMs: 60 * 60 * 1000 };
export const RESET_COMPLETE_IP_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };
const BCRYPT_COST = 12;

type Failure = { ok: false; status: number; error: string };

export async function requestPasswordReset(input: {
  email: unknown;
  ip: string;
  origin: string;
  now?: Date;
}): Promise<{ ok: true } | Failure> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, status: 400, error: "Enter a valid email address." };

  if (!(await hitRateLimit(`reset:ip:${input.ip}`, RESET_IP_LIMIT.limit, RESET_IP_LIMIT.windowMs, now))) {
    return { ok: false, status: 429, error: "Too many requests. Please try again later." };
  }
  // Per-address cap: silent, so it can't be used to probe or to flood an inbox.
  if (!(await hitRateLimit(`reset:email:${email}`, RESET_EMAIL_LIMIT.limit, RESET_EMAIL_LIMIT.windowMs, now))) {
    return { ok: true };
  }

  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }); // housekeeping

  const user = await findUserByEmail(email);
  if (!user) return { ok: true }; // no account — say nothing

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) },
    }),
  ]);

  const link = `${input.origin}/reset-password?token=${token}`;
  const name = user.name ?? "there";
  await sendEmail({
    to: user.email!,
    subject: "Reset your EcoQuest PH password",
    text:
      `Hi ${name},\n\nSomeone (hopefully you) asked to reset your EcoQuest PH password. Choose a new one here:\n${link}\n\n` +
      `This link works once and expires in 1 hour. If you didn't ask, ignore this email — your password won't change.`,
    html:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Someone (hopefully you) asked to reset your EcoQuest PH password.</p>` +
      `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Choose a new password</a></p>` +
      `<p style="color:#555;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(link)}</p>` +
      `<p style="color:#555;font-size:13px">This link works once and expires in 1 hour. If you didn't ask, ignore this email — your password won't change.</p>`,
  });
  return { ok: true };
}

/** Looks up a still-valid reset link (read-only — viewing the page doesn't consume it). */
export async function findResetToken(token: unknown, now = new Date()) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true } } },
  });
  return row && row.expiresAt > now ? row : null;
}

export async function resetPassword(input: {
  token: unknown;
  password: unknown;
  ip: string;
  now?: Date;
}): Promise<{ ok: true; email: string } | Failure> {
  const now = input.now ?? new Date();
  if (
    !(await hitRateLimit(`reset-complete:ip:${input.ip}`, RESET_COMPLETE_IP_LIMIT.limit, RESET_COMPLETE_IP_LIMIT.windowMs, now))
  ) {
    return { ok: false, status: 429, error: "Too many attempts. Please try again later." };
  }

  const row = await findResetToken(input.token, now);
  if (!row) return { ok: false, status: 400, error: "This reset link is invalid or has expired. Please request a new one." };
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, status: 400, error: problem };

  const passwordHash = await bcrypt.hash(input.password as string, BCRYPT_COST);

  return prisma.$transaction(async (tx) => {
    // Consume the link; a concurrent use of the same link loses here.
    const { count } = await tx.passwordResetToken.deleteMany({ where: { id: row.id, tokenHash: row.tokenHash } });
    if (count === 0) {
      return { ok: false as const, status: 400, error: "This reset link has already been used. Please sign in." };
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
    await tx.user.update({
      where: { id: user.id },
      // Opening the emailed link proves inbox ownership.
      data: { passwordHash, emailVerified: user.emailVerified ?? now },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    // The owner just proved who they are — lift any login lockout on this address.
    if (user.email) await tx.rateLimit.deleteMany({ where: { key: `login:email:${normalizeEmail(user.email)}` } });
    return { ok: true as const, email: user.email ?? "" };
  });
}
