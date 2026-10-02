import { beforeEach, describe, expect, it } from "vitest";
import { POST as createAd } from "@/app/api/admin/patron-ads/route";
import { DELETE as deleteAd, PATCH as updateAd } from "@/app/api/admin/patron-ads/[id]/route";
import { POST as completeOnboarding } from "@/app/api/onboarding/route";
import { prisma } from "@/lib/prisma";
import { createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const ad = {
  companyName: "Green Corp",
  imageUrl: "https://cdn.example.ph/banner.png",
  targetUrl: "https://example.ph/promo",
};
const existingAd = () => prisma.patronAd.create({ data: ad });

describe("patron ads admin API", () => {
  it("is admin-only", async () => {
    signInAs(await createUser({ role: "PATRON" }));
    const { id } = await existingAd();
    expect((await createAd(jsonRequest(ad))).status).toBe(403);
    expect((await updateAd(jsonRequest({ isActive: false }, "PATCH"), ctx({ id }))).status).toBe(403);
    expect((await deleteAd(new Request("http://test.local"), ctx({ id }))).status).toBe(403);
  });

  it("creates, pauses and deletes banners", async () => {
    signInAs(await createUser({ role: "ADMIN" }));

    const created = await createAd(jsonRequest(ad));
    expect(created.status).toBe(201);
    const { ad: saved } = await created.json();
    expect(saved).toMatchObject({ ...ad, isActive: true });

    const paused = await updateAd(jsonRequest({ isActive: false }, "PATCH"), ctx({ id: saved.id }));
    expect((await paused.json()).ad.isActive).toBe(false);

    expect((await deleteAd(new Request("http://test.local"), ctx({ id: saved.id }))).status).toBe(200);
    expect(await prisma.patronAd.count()).toBe(0);
  });

  it("rejects non-https links and 404s unknown ads", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await createAd(jsonRequest({ ...ad, targetUrl: "javascript:alert(1)" }))).status).toBe(400);
    expect((await updateAd(jsonRequest({ isActive: true }, "PATCH"), ctx({ id: "nope" }))).status).toBe(404);
    expect((await deleteAd(new Request("http://test.local"), ctx({ id: "nope" }))).status).toBe(404);
  });
});

describe("POST /api/onboarding", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await completeOnboarding()).status).toBe(401);
  });

  it("records the first completion only", async () => {
    const user = await createUser();
    signInAs(user);

    await completeOnboarding();
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).onboardedAt;
    expect(first).not.toBeNull();

    await completeOnboarding();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).onboardedAt).toEqual(first);
  });
});
