import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimRoute } from "@/app/api/referrals/claim/route";
import { GET as inviteRoute } from "@/app/r/[code]/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { prisma } from "@/lib/prisma";
import { attachReferral, getReferralSummary, REFERRAL_BONUS_POINTS, REFERRAL_COOKIE } from "@/lib/referrals";
import { createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const claim = (code: unknown) => claimRoute(jsonRequest({ code }));

/** Creates a quest with a pending verification for `userId`, ready for approval. */
async function pendingSubmission(userId: string, plantCount = 2) {
  const slot = await createSlot({ pointsPerPlant: 10 });
  const quest = await prisma.quest.create({
    data: { userId, slotId: slot.id, status: "PENDING_VERIFICATION" },
  });
  return prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount },
  });
}

async function approve(verificationId: string) {
  const admin = await createUser({ role: "ADMIN" });
  signInAs(admin);
  return review(jsonRequest({ action: "approve" }), ctx({ id: verificationId }));
}

describe("referral codes", () => {
  it("new users get a short, URL-safe code", async () => {
    const user = await createUser();
    expect(user.referralCode).toMatch(/^[A-Za-z0-9_-]{10}$/);
  });
});

describe("attachReferral / POST /api/referrals/claim", () => {
  it("links the user to the code's owner", async () => {
    const referrer = await createUser({ name: "Ate Rosa" });
    const user = await createUser();
    signInAs(user);

    const res = await claim(referrer.referralCode);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ referrer: { name: "Ate Rosa" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referredByUserId).toBe(referrer.id);
  });

  it.each([
    ["an unknown code", async () => "nope-nope"],
    ["a blank code", async () => "  "],
    ["a non-string code", async () => 12345],
  ])("rejects %s", async (_label, code) => {
    signInAs(await createUser());
    expect((await claim(await code())).status).toBe(400);
  });

  it("rejects your own code", async () => {
    const user = await createUser();
    signInAs(user);
    expect((await (await claim(user.referralCode)).json()).error).toMatch(/own invite code/);
  });

  it("only allows one referrer", async () => {
    const [a, b, user] = [await createUser(), await createUser(), await createUser()];
    expect((await attachReferral(user.id, a.referralCode)).ok).toBe(true);
    expect(await attachReferral(user.id, b.referralCode)).toMatchObject({ ok: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referredByUserId).toBe(a.id);
  });

  it("blocks 2-person loops", async () => {
    const a = await createUser();
    const b = await createUser({ referredByUserId: a.id });
    expect(await attachReferral(a.id, b.referralCode)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/someone you invited/),
    });
  });

  it("is closed after the user's first verified planting", async () => {
    const referrer = await createUser();
    const user = await createUser();
    const slot = await createSlot();
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "COMPLETED" } });
    expect(await attachReferral(user.id, referrer.referralCode)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/before your first verified planting/),
    });
  });

  it("requires a session", async () => {
    signInAs(null);
    expect((await claim("x")).status).toBe(401);
  });
});

describe("referral bonus", () => {
  it(`pays the referrer ${REFERRAL_BONUS_POINTS} pts on the referee's first approved planting, once`, async () => {
    const referrer = await createUser({ points: 10 });
    const referee = await createUser({ referredByUserId: referrer.id });

    const first = await approve((await pendingSubmission(referee.id)).id);
    expect((await first.json()).referralBonus).toEqual({ referrerId: referrer.id, points: REFERRAL_BONUS_POINTS });

    const r = await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } });
    expect(r.points).toBe(10 + REFERRAL_BONUS_POINTS);
    expect(r.weeklyPoints).toBe(REFERRAL_BONUS_POINTS);
    expect(r.totalPlants).toBe(0); // bonus isn't plants

    // Second approval: no further bonus.
    const second = await approve((await pendingSubmission(referee.id)).id);
    expect((await second.json()).referralBonus).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).points).toBe(10 + REFERRAL_BONUS_POINTS);
  });

  it("pays nothing for users without a referrer, or on rejection", async () => {
    const referrer = await createUser();
    const plain = await createUser();
    expect((await (await approve((await pendingSubmission(plain.id)).id)).json()).referralBonus).toBeNull();

    const referee = await createUser({ referredByUserId: referrer.id });
    const v = await pendingSubmission(referee.id);
    signInAs(await createUser({ role: "ADMIN" }));
    await review(jsonRequest({ action: "reject" }), ctx({ id: v.id }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: referrer.id } })).points).toBe(0);
  });

  it("summarizes invited and qualified friends", async () => {
    const referrer = await createUser();
    await createUser({ name: "Paid", referredByUserId: referrer.id, referralBonusAwardedAt: new Date() });
    await createUser({ name: "Waiting", referredByUserId: referrer.id });
    await createUser({ name: "Someone else's" });

    const summary = await getReferralSummary(referrer.id);
    expect(summary).toMatchObject({ invited: 2, qualified: 1, pointsEarned: REFERRAL_BONUS_POINTS });
    expect(summary.referrals.map((r) => [r.name, r.bonusAwarded]).sort()).toEqual([
      ["Paid", true],
      ["Waiting", false],
    ]);
  });
});

describe("GET /r/:code invite link", () => {
  const visit = (code: string) => inviteRoute(new Request(`http://test.local/r/${code}`), ctx({ code }));

  it("sets the referral cookie and sends visitors to sign up, then the hub", async () => {
    const referrer = await createUser();
    signInAs(null);
    const res = await visit(referrer.referralCode);

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/signup");
    expect(location.searchParams.get("callbackUrl")).toBe(`/referrals?code=${referrer.referralCode}`);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain(`${REFERRAL_COOKIE}=${referrer.referralCode}`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("sends signed-in users straight to the hub with the code prefilled", async () => {
    const referrer = await createUser();
    signInAs(await createUser());
    const res = await visit(referrer.referralCode);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe(
      `/referrals?code=${referrer.referralCode}`,
    );
  });

  it("ignores unknown codes (no cookie)", async () => {
    signInAs(null);
    const res = await visit("doesnotexist");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
