import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as registerRoute } from "@/app/api/register/route";
import { POST as completeRoute } from "@/app/api/register/complete/route";
import { EmailDeliveryError, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { hitRateLimit } from "@/lib/rate-limit";
import { REFERRAL_COOKIE } from "@/lib/referrals";
import {
  completeRegistration,
  findPendingByToken,
  LOGIN_LIMIT,
  MAX_EMAILS_PER_DAY,
  MAX_EXISTING_NOTICES_PER_DAY,
  RESEND_COOLDOWN_MS,
  SIGNUP_IP_LIMIT,
  startRegistration,
  TOKEN_TTL_MS,
  UNKNOWN_EMAIL_LIMIT,
  verifyCredentials,
} from "@/lib/registration";
import { createUser, resetDb } from "../helpers";

const sent = vi.mocked(sendEmail);
const ORIGIN = "https://ecoquest.test";
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter}`;

function register(body: object, ip = freshIp()) {
  return registerRoute(
    new Request(`${ORIGIN}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

function complete(body: object, { ip = freshIp(), cookie }: { ip?: string; cookie?: string } = {}) {
  return completeRoute(
    new Request(`${ORIGIN}/api/register/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

/** Extracts the token from the most recently sent confirmation email. */
function lastToken() {
  const email = sent.mock.calls.at(-1)?.[0];
  const match = email?.text.match(/\/signup\/complete\?token=([\w-]+)/);
  if (!match) throw new Error("No confirmation email sent");
  return match[1];
}

beforeEach(async () => {
  await resetDb();
  sent.mockClear();
  sent.mockImplementation(async () => {});
});

describe("POST /api/register", () => {
  it("emails a one-time confirmation link and creates no account yet", async () => {
    const res = await register({ name: "Maria Clara", email: "  Maria@Example.PH " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sent).toHaveBeenCalledTimes(1);
    const email = sent.mock.calls[0][0];
    expect(email.to).toBe("maria@example.ph");
    expect(email.text).toContain(`${ORIGIN}/signup/complete?token=`);
    expect(email.html).toContain(`${ORIGIN}/signup/complete?token=`);

    expect(await prisma.user.count()).toBe(0);
    const pending = await prisma.pendingRegistration.findUniqueOrThrow({ where: { email: "maria@example.ph" } });
    expect(pending.tokenHash).not.toBe(lastToken()); // only the hash is stored
  });

  it("escapes the name in the HTML email", async () => {
    await register({ name: "<b>Hacker</b>", email: "x@example.ph" });
    const { html } = sent.mock.calls[0][0];
    expect(html).toContain("&lt;b&gt;Hacker&lt;/b&gt;");
    expect(html).not.toContain("<b>Hacker</b>");
  });

  it.each([
    [{ name: "", email: "a@example.ph" }],
    [{ name: "A", email: "not-an-email" }],
    [{ email: "a@example.ph" }],
  ])("rejects invalid input %j", async (body) => {
    expect((await register(body)).status).toBe(400);
    expect(sent).not.toHaveBeenCalled();
  });

  it("silently ignores the honeypot", async () => {
    const res = await register({ name: "Bot", email: "bot@example.ph", website: "http://spam" });
    expect(await res.json()).toEqual({ ok: true });
    expect(sent).not.toHaveBeenCalled();
    expect(await prisma.pendingRegistration.count()).toBe(0);
  });

  it("gives the same answer for registered emails, and tells the owner instead of sending a sign-up link", async () => {
    await createUser({ email: "taken@example.ph", name: "Owner" });
    const res = await register({ name: "X", email: "TAKEN@example.ph" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sent).toHaveBeenCalledTimes(1);
    const notice = sent.mock.calls[0][0];
    expect(notice.to).toBe("taken@example.ph");
    expect(notice.subject).toMatch(/already have an EcoQuest PH account/);
    expect(notice.text).toContain(`${ORIGIN}/forgot-password?email=taken%40example.ph`);
    expect(notice.text).not.toContain("/signup/complete");
    expect(await prisma.pendingRegistration.count()).toBe(0);
  });

  it(`caps "already registered" notices at ${MAX_EXISTING_NOTICES_PER_DAY} per day`, async () => {
    await createUser({ email: "taken@example.ph" });
    for (let i = 0; i < MAX_EXISTING_NOTICES_PER_DAY + 2; i++) {
      expect((await register({ name: "X", email: "taken@example.ph" })).status).toBe(200);
    }
    expect(sent).toHaveBeenCalledTimes(MAX_EXISTING_NOTICES_PER_DAY);
  });

  it(`waits ${RESEND_COOLDOWN_MS / 1000}s between emails to the same address`, async () => {
    const t0 = new Date("2026-10-02T00:00:00Z");
    const args = { name: "A", email: "a@example.ph", origin: ORIGIN };
    await startRegistration({ ...args, ip: freshIp(), now: t0 });
    await startRegistration({ ...args, ip: freshIp(), now: new Date(t0.getTime() + 30_000) });
    expect(sent).toHaveBeenCalledTimes(1);
    await startRegistration({ ...args, ip: freshIp(), now: new Date(t0.getTime() + 61_000) });
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it("a resend invalidates the previous link", async () => {
    const t0 = new Date();
    const args = { name: "A", email: "a@example.ph", origin: ORIGIN };
    await startRegistration({ ...args, ip: freshIp(), now: t0 });
    const first = lastToken();
    await startRegistration({ ...args, ip: freshIp(), now: new Date(t0.getTime() + 61_000) });
    expect(await findPendingByToken(first)).toBeNull();
    expect(await findPendingByToken(lastToken())).not.toBeNull();
  });

  it(`caps emails to one address at ${MAX_EMAILS_PER_DAY} per day`, async () => {
    const t0 = new Date("2026-10-02T00:00:00Z").getTime();
    const args = { name: "A", email: "victim@example.ph", origin: ORIGIN };
    for (let i = 0; i < MAX_EMAILS_PER_DAY + 3; i++) {
      await startRegistration({ ...args, ip: freshIp(), now: new Date(t0 + i * 2 * RESEND_COOLDOWN_MS) });
    }
    expect(sent).toHaveBeenCalledTimes(MAX_EMAILS_PER_DAY);

    // A new day resets the cap.
    await startRegistration({ ...args, ip: freshIp(), now: new Date(t0 + TOKEN_TTL_MS + 1) });
    expect(sent).toHaveBeenCalledTimes(MAX_EMAILS_PER_DAY + 1);
  });

  it(`limits each IP to ${SIGNUP_IP_LIMIT.limit} sign-ups per hour`, async () => {
    const ip = "203.0.113.9";
    for (let i = 0; i < SIGNUP_IP_LIMIT.limit; i++) {
      expect((await register({ name: "A", email: `a${i}@example.ph` }, ip)).status).toBe(200);
    }
    const res = await register({ name: "A", email: "one-more@example.ph" }, ip);
    expect(res.status).toBe(429);
    expect(sent).toHaveBeenCalledTimes(SIGNUP_IP_LIMIT.limit);
  });

  it("answers 503 (not a crash) when the email can't be sent", async () => {
    sent.mockRejectedValueOnce(new EmailDeliveryError("SMTP down"));
    const res = await register({ name: "A", email: "a@example.ph" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/couldn't send/);
  });

  it("doesn't disguise other failures as an email outage", async () => {
    sent.mockRejectedValueOnce(new TypeError("a real bug"));
    await expect(register({ name: "A", email: "a@example.ph" })).rejects.toThrow("a real bug");
  });

  it("lets the user retry immediately if the email fails to send", async () => {
    sent.mockRejectedValueOnce(new EmailDeliveryError("SMTP down"));
    await expect(
      startRegistration({ name: "A", email: "a@example.ph", ip: freshIp(), origin: ORIGIN }),
    ).rejects.toThrow("SMTP down");
    await startRegistration({ name: "A", email: "a@example.ph", ip: freshIp(), origin: ORIGIN });
    expect(sent).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/register/complete", () => {
  async function startAndGetToken(email = "maria@example.ph") {
    await register({ name: "Maria", email });
    return lastToken();
  }

  it("creates a verified account with a bcrypt-hashed password, and the link works once", async () => {
    const token = await startAndGetToken();
    const res = await complete({ token, name: "Maria Clara", password: "plant-a-tree" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "maria@example.ph" });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "maria@example.ph" } });
    expect(user.name).toBe("Maria Clara");
    expect(user.emailVerified).not.toBeNull();
    expect(user.passwordHash).not.toBe("plant-a-tree");
    expect(await bcrypt.compare("plant-a-tree", user.passwordHash!)).toBe(true);
    expect(await prisma.pendingRegistration.count()).toBe(0);

    const again = await complete({ token, name: "Mallory", password: "attacker-pass" });
    expect(again.status).toBe(400);
    expect(await bcrypt.compare("plant-a-tree", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash!)).toBe(true);
  });

  it.each(["", "garbage", "x".repeat(43), undefined])("rejects invalid token %j", async (token) => {
    expect((await complete({ token, name: "A", password: "long-enough" })).status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects expired links", async () => {
    const token = await startAndGetToken();
    await prisma.pendingRegistration.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await complete({ token, name: "A", password: "long-enough" })).status).toBe(400);
  });

  it("rejects weak passwords without using up the link", async () => {
    const token = await startAndGetToken();
    expect((await complete({ token, name: "A", password: "short" })).status).toBe(400);
    expect(await findPendingByToken(token)).not.toBeNull();
    expect((await complete({ token, name: "A", password: "now-long-enough" })).status).toBe(200);
  });

  it("adds a password to a Google account with the same email (link proves inbox ownership)", async () => {
    const token = await startAndGetToken("dual@example.ph");
    const google = await createUser({ email: "dual@example.ph", passwordHash: null });
    expect((await complete({ token, name: "A", password: "long-enough" })).status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: google.id } });
    expect(await bcrypt.compare("long-enough", user.passwordHash!)).toBe(true);
    expect(await prisma.user.count()).toBe(1);
  });

  it("refuses to overwrite an existing password", async () => {
    const token = await startAndGetToken("has-pw@example.ph");
    await createUser({ email: "has-pw@example.ph", passwordHash: await bcrypt.hash("original-pw", 4) });
    expect((await complete({ token, name: "A", password: "new-password" })).status).toBe(409);
  });

  it("applies an invite-link referral cookie to the new account", async () => {
    const referrer = await createUser();
    const token = await startAndGetToken("invited@example.ph");
    await complete({ token, name: "A", password: "long-enough" }, { cookie: `${REFERRAL_COOKIE}=${referrer.referralCode}` });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "invited@example.ph" } });
    expect(user.referredByUserId).toBe(referrer.id);
  });

  it("is rate-limited per IP", async () => {
    const ip = "198.51.100.7";
    for (let i = 0; i < 20; i++) await complete({ token: "bad-token-xxxxxxxxxxxxxxxx", name: "A", password: "x" }, { ip });
    expect((await complete({ token: "bad-token-xxxxxxxxxxxxxxxx", name: "A", password: "x" }, { ip })).status).toBe(429);
  });

  it("viewing the link (findPendingByToken) doesn't consume it", async () => {
    const token = await startAndGetToken();
    expect(await findPendingByToken(token)).not.toBeNull();
    expect(await findPendingByToken(token)).not.toBeNull();
  });

  it("completeRegistration validates the name too", async () => {
    const token = await startAndGetToken();
    expect(await completeRegistration({ token, name: "  ", password: "long-enough", ip: freshIp() })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("verifyCredentials (email/password login)", () => {
  async function account(overrides = {}) {
    return createUser({ email: "login@example.ph", passwordHash: await bcrypt.hash("right-password", 4), ...overrides });
  }

  it("accepts the right password, case-insensitively on email", async () => {
    const user = await account();
    expect(await verifyCredentials(" LOGIN@example.ph ", "right-password")).toMatchObject({
      ok: true,
      user: { id: user.id, role: "USER" },
    });
  });

  it("rejects wrong passwords and badly formatted emails", async () => {
    await account();
    expect(await verifyCredentials("login@example.ph", "wrong")).toEqual({ ok: false, code: "invalid" });
    expect(await verifyCredentials("not-an-email", "x")).toEqual({ ok: false, code: "invalid" });
  });

  it("tells a well-formed unknown email apart, until the per-IP cap", async () => {
    const now = new Date();
    expect(await verifyCredentials("nobody@example.ph", "x", now, "1.2.3.4")).toEqual({ ok: false, code: "not_found" });
    for (let i = 1; i < UNKNOWN_EMAIL_LIMIT.limit; i++) await verifyCredentials(`n${i}@example.ph`, "x", now, "1.2.3.4");
    expect(await verifyCredentials("other@example.ph", "x", now, "1.2.3.4")).toEqual({ ok: false, code: "invalid" });
    // Another IP isn't affected.
    expect(await verifyCredentials("other@example.ph", "x", now, "5.6.7.8")).toEqual({ ok: false, code: "not_found" });
  });

  it("rejects Google-only accounts (no password)", async () => {
    await account({ passwordHash: null });
    expect(await verifyCredentials("login@example.ph", "anything")).toEqual({ ok: false, code: "invalid" });
  });

  it("refuses unverified accounts", async () => {
    await account({ emailVerified: null });
    expect(await verifyCredentials("login@example.ph", "right-password")).toEqual({ ok: false, code: "unverified" });
  });

  it(`locks an email after ${LOGIN_LIMIT.limit} attempts in 15 minutes`, async () => {
    await account();
    for (let i = 0; i < LOGIN_LIMIT.limit; i++) await verifyCredentials("login@example.ph", "wrong");
    expect(await verifyCredentials("login@example.ph", "right-password")).toEqual({ ok: false, code: "rate_limited" });
  });
});

describe("housekeeping", () => {
  it("a sign-up prunes expired pending sign-ups and stale rate-limit counters, keeping live ones", async () => {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    await prisma.pendingRegistration.createMany({
      data: [
        { email: "old@example.ph", name: "Old", tokenHash: "h1", expiresAt: new Date(now.getTime() - 1000), lastSentAt: new Date(now.getTime() - day) },
        { email: "live@example.ph", name: "Live", tokenHash: "h2", expiresAt: new Date(now.getTime() + 1000), lastSentAt: now },
      ],
    });
    await prisma.rateLimit.createMany({
      data: [
        { key: "stale", count: 3, windowStart: new Date(now.getTime() - 2 * day) },
        { key: "fresh", count: 3, windowStart: now },
      ],
    });

    await register({ name: "New", email: "new@example.ph" });

    expect((await prisma.pendingRegistration.findMany({ orderBy: { email: "asc" } })).map((p) => p.email)).toEqual([
      "live@example.ph",
      "new@example.ph",
    ]);
    const keys = (await prisma.rateLimit.findMany()).map((r) => r.key);
    expect(keys).toContain("fresh");
    expect(keys).not.toContain("stale");
  });
});

describe("hitRateLimit", () => {
  it("allows `limit` hits per window, then resets", async () => {
    const t0 = new Date("2026-10-02T00:00:00Z");
    const hit = (ms: number) => hitRateLimit("test:key", 2, 1000, new Date(t0.getTime() + ms));
    expect(await hit(0)).toBe(true);
    expect(await hit(100)).toBe(true);
    expect(await hit(200)).toBe(false);
    expect(await hit(1000)).toBe(true); // new window
  });
});
