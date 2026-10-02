import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { hitRateLimit, pruneRateLimits } from "@/lib/rate-limit";

// Email sign-up flow:
//   1. startRegistration(name, email)  → emails a one-time link (no account yet)
//   2. the link opens /signup/complete, where the user picks a password
//   3. completeRegistration(token, …)  → creates the account with emailVerified set
// Because the password is chosen *after* proving inbox access, nobody can pre-register
// someone else's address, and every email/password account is verified by construction.

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_EMAILS_PER_DAY = 5;
export const MAX_EXISTING_NOTICES_PER_DAY = 3;
export const SIGNUP_IP_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
export const COMPLETE_IP_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };
export const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything longer
const MAX_NAME_LENGTH = 60;
const BCRYPT_COST = 12;
// Hash of a random secret: compared against when an account doesn't exist, so login
// timing doesn't reveal which emails are registered.
const DUMMY_HASH = "$2b$12$t/emMwHtODM79RGGo/sGTOe9ycX7kGf9nMUaX2U62k.nFZfrHAWCO";

type Failure = { ok: false; status: number; error: string };

// ─── Validation ────────────────────────────────────────────────────────────

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function validateName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim().replace(/\s+/g, " ");
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(input: unknown): string | null {
  if (typeof input !== "string" || input.trim().length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Buffer.byteLength(input, "utf8") > MAX_PASSWORD_BYTES) {
    return `Password is too long (max ${MAX_PASSWORD_BYTES} bytes).`;
  }
  return null;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}

// ─── Step 1: start ─────────────────────────────────────────────────────────

/**
 * Emails a sign-up link. The response is the same whether or not the address is
 * already registered, on cooldown, or over its daily cap — so it can't be used to
 * discover accounts, and it can't be used to flood someone's inbox.
 */
export async function startRegistration(input: {
  name: unknown;
  email: unknown;
  ip: string;
  origin: string;
  now?: Date;
}): Promise<{ ok: true } | Failure> {
  const now = input.now ?? new Date();
  const name = validateName(input.name);
  if (!name) return { ok: false, status: 400, error: `Enter your name (up to ${MAX_NAME_LENGTH} characters).` };
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, status: 400, error: "Enter a valid email address." };

  if (!(await hitRateLimit(`signup:ip:${input.ip}`, SIGNUP_IP_LIMIT.limit, SIGNUP_IP_LIMIT.windowMs, now))) {
    return { ok: false, status: 429, error: "Too many sign-up attempts. Please try again later." };
  }

  // Housekeeping: drop stale counters and expired sign-ups. An expired row's daily cap has
  // also lapsed (expiresAt = last send + 24h), so deleting it never loosens a limit.
  await Promise.all([
    pruneRateLimits(now),
    prisma.pendingRegistration.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);

  const existing = await findUserByEmail(email);
  if (existing) {
    // Same reply to the requester (no account discovery), but tell the real owner — otherwise
    // someone who forgot they registered is stuck. Capped so it can't flood their inbox.
    if (await hitRateLimit(`signup-existing:email:${email}`, MAX_EXISTING_NOTICES_PER_DAY, TOKEN_TTL_MS, now)) {
      await sendExistingAccountNotice(existing.email ?? email, existing.name, input.origin);
    }
    return { ok: true };
  }

  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  const inWindow = pending && now.getTime() - pending.windowStart.getTime() < TOKEN_TTL_MS;
  if (pending && now.getTime() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS) return { ok: true };
  if (inWindow && pending.sendCount >= MAX_EMAILS_PER_DAY) return { ok: true };

  const token = randomBytes(32).toString("base64url");
  const fields = { name, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS), lastSentAt: now };
  await prisma.pendingRegistration.upsert({
    where: { email },
    create: { email, ...fields, sendCount: 1, windowStart: now },
    update: inWindow ? { ...fields, sendCount: { increment: 1 } } : { ...fields, sendCount: 1, windowStart: now },
  });

  const link = `${input.origin}/signup/complete?token=${token}`;
  try {
    await sendEmail({
      to: email,
      subject: "Confirm your email for EcoQuest PH",
      text:
        `Hi ${name},\n\nConfirm your email to finish creating your EcoQuest PH account:\n${link}\n\n` +
        `This link expires in 24 hours. If you didn't sign up, you can ignore this email.`,
      html:
        `<p>Hi ${escapeHtml(name)},</p>` +
        `<p>Confirm your email to finish creating your EcoQuest PH account:</p>` +
        `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Confirm email</a></p>` +
        `<p style="color:#555;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(link)}</p>` +
        `<p style="color:#555;font-size:13px">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>`,
    });
  } catch (err) {
    // Let the user retry immediately instead of waiting out the cooldown.
    await prisma.pendingRegistration
      .update({ where: { email }, data: { lastSentAt: new Date(0) } })
      .catch(() => {});
    throw err;
  }
  return { ok: true };
}

function sendExistingAccountNotice(to: string, name: string | null, origin: string) {
  const login = `${origin}/login?email=${encodeURIComponent(to)}`;
  const reset = `${origin}/forgot-password?email=${encodeURIComponent(to)}`;
  const hi = name ?? "there";
  return sendEmail({
    to,
    subject: "You already have an EcoQuest PH account",
    text:
      `Hi ${hi},\n\nSomeone (hopefully you) tried to sign up with this email, but it already has an EcoQuest PH account.\n\n` +
      `Sign in: ${login}\nForgot your password? Reset it: ${reset}\n\nIf this wasn't you, you can ignore this email.`,
    html:
      `<p>Hi ${escapeHtml(hi)},</p>` +
      `<p>Someone (hopefully you) tried to sign up with this email, but it already has an EcoQuest PH account.</p>` +
      `<p><a href="${escapeHtml(login)}" style="display:inline-block;padding:10px 18px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Sign in</a></p>` +
      `<p>Forgot your password? <a href="${escapeHtml(reset)}">Reset it here</a>.</p>` +
      `<p style="color:#555;font-size:13px">If this wasn't you, you can ignore this email.</p>`,
  });
}

// ─── Step 2: the emailed link ──────────────────────────────────────────────

/** Looks up a still-valid pending sign-up by its emailed token (read-only). */
export async function findPendingByToken(token: unknown, now = new Date()) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const pending = await prisma.pendingRegistration.findUnique({ where: { tokenHash: hashToken(token) } });
  return pending && pending.expiresAt > now ? pending : null;
}

// ─── Step 3: complete ──────────────────────────────────────────────────────

export async function completeRegistration(input: {
  token: unknown;
  name: unknown;
  password: unknown;
  ip: string;
  now?: Date;
}): Promise<{ ok: true; email: string; userId: string; created: boolean } | Failure> {
  const now = input.now ?? new Date();
  if (!(await hitRateLimit(`signup-complete:ip:${input.ip}`, COMPLETE_IP_LIMIT.limit, COMPLETE_IP_LIMIT.windowMs, now))) {
    return { ok: false, status: 429, error: "Too many attempts. Please try again later." };
  }

  const pending = await findPendingByToken(input.token, now);
  if (!pending) {
    return { ok: false, status: 400, error: "This link is invalid or has expired. Please sign up again." };
  }
  const name = validateName(input.name);
  if (!name) return { ok: false, status: 400, error: `Enter your name (up to ${MAX_NAME_LENGTH} characters).` };
  const problem = passwordProblem(input.password);
  if (problem) return { ok: false, status: 400, error: problem };

  const passwordHash = await bcrypt.hash(input.password as string, BCRYPT_COST);

  return prisma.$transaction(async (tx) => {
    // Consume the token; a concurrent use of the same link loses here.
    const { count } = await tx.pendingRegistration.deleteMany({
      where: { id: pending.id, tokenHash: pending.tokenHash },
    });
    if (count === 0) {
      return { ok: false as const, status: 400, error: "This link has already been used. Please sign in." };
    }

    const existing = await tx.user.findFirst({ where: { email: { equals: pending.email, mode: "insensitive" } } });
    if (existing?.passwordHash) {
      return { ok: false as const, status: 409, error: "An account with this email already exists. Please sign in." };
    }
    if (existing) {
      // e.g. a Google account created meanwhile: the link proves inbox ownership, so add a password to it.
      await tx.user.update({
        where: { id: existing.id },
        data: { passwordHash, emailVerified: existing.emailVerified ?? now },
      });
      return { ok: true as const, email: pending.email, userId: existing.id, created: false };
    }
    const user = await tx.user.create({ data: { name, email: pending.email, passwordHash, emailVerified: now } });
    return { ok: true as const, email: pending.email, userId: user.id, created: true };
  });
}

// ─── Login ─────────────────────────────────────────────────────────────────

export type CredentialsCheck =
  | { ok: true; user: { id: string; name: string | null; email: string | null; role: string } }
  | { ok: false; code: "invalid" | "unverified" | "rate_limited" };

/** Checks an email/password login. Rate-limited per email to stop password guessing. */
export async function verifyCredentials(emailInput: unknown, password: unknown, now = new Date()): Promise<CredentialsCheck> {
  const email = normalizeEmail(emailInput);
  if (!email || typeof password !== "string" || !password) return { ok: false, code: "invalid" };

  if (!(await hitRateLimit(`login:email:${email}`, LOGIN_LIMIT.limit, LOGIN_LIMIT.windowMs, now))) {
    return { ok: false, code: "rate_limited" };
  }

  const user = await findUserByEmail(email);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !valid) return { ok: false, code: "invalid" };
  if (!user.emailVerified) return { ok: false, code: "unverified" };

  return { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}
