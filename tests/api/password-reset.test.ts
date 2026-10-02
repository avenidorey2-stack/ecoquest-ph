import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as forgotRoute } from "@/app/api/password/forgot/route";
import { POST as resetRoute } from "@/app/api/password/reset/route";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { findResetToken, RESET_EMAIL_LIMIT, RESET_IP_LIMIT, RESET_TTL_MS } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { LOGIN_LIMIT, verifyCredentials } from "@/lib/registration";
import { createUser, resetDb } from "../helpers";

const sent = vi.mocked(sendEmail);
const ORIGIN = "https://ecoquest.test";
let ipCounter = 0;
const freshIp = () => `10.1.0.${++ipCounter}`;

function post(handler: (req: Request) => Promise<Response>, body: object, ip = freshIp()) {
  return handler(
    new Request(`${ORIGIN}/api/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}
const forgot = (email: unknown, ip?: string) => post(forgotRoute, { email }, ip);
const reset = (token: unknown, password: unknown, ip?: string) => post(resetRoute, { token, password }, ip);

function lastToken() {
  const match = sent.mock.calls.at(-1)?.[0].text.match(/\/reset-password\?token=([\w-]+)/);
  if (!match) throw new Error("No reset email sent");
  return match[1];
}

async function account(overrides = {}) {
  return createUser({
    email: "rey@example.ph",
    name: "Rey",
    passwordHash: await bcrypt.hash("old-password", 4),
    ...overrides,
  });
}

beforeEach(async () => {
  await resetDb();
  sent.mockClear();
  sent.mockImplementation(async () => {});
});

describe("POST /api/password/forgot", () => {
  it("emails a single-use reset link to an existing account (case-insensitive)", async () => {
    await account();
    const res = await forgot("  REY@example.PH ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sent).toHaveBeenCalledTimes(1);
    const email = sent.mock.calls[0][0];
    expect(email.to).toBe("rey@example.ph");
    expect(email.text).toContain(`${ORIGIN}/reset-password?token=`);
    const row = await prisma.passwordResetToken.findFirstOrThrow();
    expect(row.tokenHash).not.toBe(lastToken()); // only the hash is stored
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(RESET_TTL_MS);
  });

  it("answers identically for unknown emails, without sending anything", async () => {
    const res = await forgot("nobody@example.ph");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).not.toHaveBeenCalled();
  });

  it("rejects malformed emails", async () => {
    expect((await forgot("not-an-email")).status).toBe(400);
  });

  it("only the newest link works", async () => {
    await account();
    await forgot("rey@example.ph");
    const first = lastToken();
    await forgot("rey@example.ph");
    expect(await findResetToken(first)).toBeNull();
    expect(await findResetToken(lastToken())).not.toBeNull();
  });

  it(`silently caps reset emails at ${RESET_EMAIL_LIMIT.limit} per hour per address`, async () => {
    await account();
    for (let i = 0; i < RESET_EMAIL_LIMIT.limit + 2; i++) {
      expect((await forgot("rey@example.ph")).status).toBe(200);
    }
    expect(sent).toHaveBeenCalledTimes(RESET_EMAIL_LIMIT.limit);
  });

  it(`limits each IP to ${RESET_IP_LIMIT.limit} requests per hour`, async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < RESET_IP_LIMIT.limit; i++) await forgot(`u${i}@example.ph`, ip);
    expect((await forgot("one-more@example.ph", ip)).status).toBe(429);
  });

  it("answers 503 when the email can't be sent", async () => {
    await account();
    sent.mockRejectedValueOnce(new EmailDeliveryError("SMTP down"));
    expect((await forgot("rey@example.ph")).status).toBe(503);
  });

  it("doesn't disguise other failures as an email outage", async () => {
    await account();
    sent.mockRejectedValueOnce(new TypeError("a real bug"));
    await expect(forgot("rey@example.ph")).rejects.toThrow("a real bug");
  });
});

describe("POST /api/password/reset", () => {
  async function tokenFor(overrides = {}) {
    const user = await account(overrides);
    await forgot("rey@example.ph");
    return { user, token: lastToken() };
  }

  it("sets the new password; the old one stops working; the link works once", async () => {
    const { token } = await tokenFor();
    const res = await reset(token, "brand-new-password");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "rey@example.ph" });

    expect((await verifyCredentials("rey@example.ph", "brand-new-password")).ok).toBe(true);
    expect(await verifyCredentials("rey@example.ph", "old-password")).toEqual({ ok: false, code: "invalid" });

    expect((await reset(token, "another-password")).status).toBe(400);
    expect((await verifyCredentials("rey@example.ph", "brand-new-password")).ok).toBe(true);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("rejects weak passwords without using up the link", async () => {
    const { token } = await tokenFor();
    expect((await reset(token, "short")).status).toBe(400);
    expect(await findResetToken(token)).not.toBeNull();
    expect((await reset(token, "long-enough-now")).status).toBe(200);
  });

  it.each(["", "garbage", "x".repeat(43), undefined])("rejects invalid token %j", async (token) => {
    await tokenFor();
    expect((await reset(token, "long-enough-now")).status).toBe(400);
  });

  it("rejects expired links", async () => {
    const { token } = await tokenFor();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await reset(token, "long-enough-now")).status).toBe(400);
  });

  it("lifts a login lockout for that email", async () => {
    const { token } = await tokenFor();
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) await verifyCredentials("rey@example.ph", "wrong");
    expect(await verifyCredentials("rey@example.ph", "old-password")).toEqual({ ok: false, code: "rate_limited" });

    await reset(token, "brand-new-password");
    expect((await verifyCredentials("rey@example.ph", "brand-new-password")).ok).toBe(true);
  });

  it("lets a Google-only account add a password (the link proves inbox ownership)", async () => {
    const { user, token } = await tokenFor({ passwordHash: null });
    expect((await reset(token, "first-password")).status).toBe(200);
    expect(await bcrypt.compare("first-password", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!)).toBe(true);
  });

  it("is rate-limited per IP", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 20; i++) await reset("bad-token-xxxxxxxxxxxxxxxx", "x", ip);
    expect((await reset("bad-token-xxxxxxxxxxxxxxxx", "x", ip)).status).toBe(429);
  });

  it("viewing the link (findResetToken) doesn't consume it", async () => {
    const { token } = await tokenFor();
    expect(await findResetToken(token)).not.toBeNull();
    expect(await findResetToken(token)).not.toBeNull();
  });

  it("does not affect other users", async () => {
    const other = await createUser({ email: "other@example.ph", passwordHash: await bcrypt.hash("other-pass", 4) });
    const { token } = await tokenFor();
    await reset(token, "brand-new-password");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(await bcrypt.compare("other-pass", after.passwordHash!)).toBe(true);
  });
});
