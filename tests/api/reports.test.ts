import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as report } from "@/app/api/reports/[userId]/route";
import { POST as decide } from "@/app/api/admin/reports/[userId]/route";
import { DELETE as lift } from "@/app/api/admin/restrictions/[userId]/route";
import { GET as search } from "@/app/api/users/search/route";
import { getCurrentUser } from "@/lib/authz";
import { REPORTS_PER_DAY, restrictionMessage } from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/lib/registration";
import { createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(resetDb);

const fileReport = (userId: string, body: object) => report(jsonRequest(body), ctx({ userId }));
const decideFor = (userId: string, body: object) => decide(jsonRequest(body), ctx({ userId }));
const inbox = async (userId: string) =>
  (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((n) => n.message);

async function cast() {
  const ana = await createUser({ name: "Ana Reporter" });
  const ben = await createUser({ name: "Ben Reported", email: "ben@test.ph", passwordHash: await bcrypt.hash("right-pass-1", 4) });
  const admin = await createUser({ name: "Team Admin", role: "ADMIN" });
  return { ana, ben, admin };
}

describe("reporting a profile", () => {
  it("files a report and tells the admins (not the reported planter)", async () => {
    const { ana, ben, admin } = await cast();
    signInAs(ana);
    const res = await fileReport(ben.id, { reason: "HARASSMENT", details: "Mean comments on my photos" });
    expect(res.status).toBe(200);
    const saved = await prisma.userReport.findFirstOrThrow();
    expect(saved).toMatchObject({ reporterId: ana.id, reportedId: ben.id, reason: "HARASSMENT", status: "OPEN" });
    expect((await inbox(admin.id))[0]).toMatch(/New report: Ben Reported/);
    expect(await inbox(ben.id)).toEqual([]);
  });

  it("updates the open report instead of piling up duplicates", async () => {
    const { ana, ben } = await cast();
    signInAs(ana);
    await fileReport(ben.id, { reason: "SPAM" });
    expect(await (await fileReport(ben.id, { reason: "HARASSMENT", details: "more" })).json()).toEqual({ ok: true, updated: true });
    expect(await prisma.userReport.count()).toBe(1);
    expect((await prisma.userReport.findFirstOrThrow()).reason).toBe("HARASSMENT");
  });

  it("refuses bad reasons, yourself, team accounts, and 'Something Else' without details", async () => {
    const { ana, ben, admin } = await cast();
    signInAs(ana);
    expect((await fileReport(ben.id, { reason: "NOPE" })).status).toBe(400);
    expect((await fileReport(ben.id, { reason: "OTHER", details: "  " })).status).toBe(400);
    expect((await fileReport(ana.id, { reason: "SPAM" })).status).toBe(400);
    expect((await fileReport(admin.id, { reason: "SPAM" })).status).toBe(400);
    expect((await fileReport("missing", { reason: "SPAM" })).status).toBe(404);
    signInAs(null);
    expect((await fileReport(ben.id, { reason: "SPAM" })).status).toBe(401);
  });

  it(`caps each planter at ${REPORTS_PER_DAY} reports a day`, async () => {
    const ana = await createUser({ name: "Ana" });
    signInAs(ana);
    for (let i = 0; i < REPORTS_PER_DAY; i++) {
      const target = await createUser({ name: `T${i}` });
      expect((await fileReport(target.id, { reason: "SPAM" })).status).toBe(200);
    }
    expect((await fileReport((await createUser()).id, { reason: "SPAM" })).status).toBe(429);
  });
});

describe("admin decisions", () => {
  it("only admins can decide", async () => {
    const { ana, ben } = await cast();
    signInAs(ana);
    await fileReport(ben.id, { reason: "SPAM" });
    expect((await decideFor(ben.id, { action: "BANNED" })).status).toBe(403);
    expect((await lift(new Request("http://test.local"), ctx({ userId: ben.id }))).status).toBe(403);
  });

  it("dismiss closes every open report and tells reporters it was reviewed", async () => {
    const { ana, ben, admin } = await cast();
    const carla = await createUser({ name: "Carla" });
    for (const u of [ana, carla]) {
      signInAs(u);
      await fileReport(ben.id, { reason: "SPAM" });
    }
    signInAs(admin);
    expect(await (await decideFor(ben.id, { action: "DISMISSED" })).json()).toEqual({ ok: true, resolved: 2 });
    expect(await prisma.userReport.count({ where: { status: "OPEN" } })).toBe(0);
    expect((await inbox(ana.id)).at(-1)).toMatch(/didn't find a rule broken/);
    expect(await inbox(ben.id)).toEqual([]);
    expect((await decideFor(ben.id, { action: "DISMISSED" })).status).toBe(409);
  });

  it("a warning needs a message and reaches the planter", async () => {
    const { ana, ben, admin } = await cast();
    signInAs(ana);
    await fileReport(ben.id, { reason: "HARASSMENT" });
    signInAs(admin);
    expect((await decideFor(ben.id, { action: "WARNED" })).status).toBe(400);
    expect((await decideFor(ben.id, { action: "WARNED", note: "Keep comments kind." })).status).toBe(200);
    expect(await inbox(ben.id)).toEqual(["Warning from the EcoQuest PH team: Keep comments kind."]);
    expect((await inbox(ana.id)).at(-1)).toMatch(/took action/);
  });

  it("a suspension blocks sign-in and sessions until it ends; lifting restores access", async () => {
    const { ana, ben, admin } = await cast();
    signInAs(ana);
    await fileReport(ben.id, { reason: "HARASSMENT" });
    signInAs(admin);
    expect((await decideFor(ben.id, { action: "SUSPENDED", days: 3 })).status).toBe(400); // only 1, 7 or 30
    expect((await decideFor(ben.id, { action: "SUSPENDED", days: 7, note: "Harassment" })).status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: ben.id } });
    expect(after.suspendedUntil!.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(restrictionMessage(after)).toMatch(/suspended until .* Reason: Harassment/);

    signInAs(ben);
    expect(await getCurrentUser()).toBeNull();
    expect(await verifyCredentials("ben@test.ph", "right-pass-1")).toEqual({ ok: false, code: "restricted" });
    // A wrong password doesn't reveal the suspension.
    expect(await verifyCredentials("ben@test.ph", "wrong-pass-1")).toEqual({ ok: false, code: "invalid" });
    // Over: back in.
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect((await verifyCredentials("ben@test.ph", "right-pass-1", later)).ok).toBe(true);

    signInAs(admin);
    expect((await lift(new Request("http://test.local"), ctx({ userId: ben.id }))).status).toBe(200);
    signInAs(ben);
    expect((await getCurrentUser())?.id).toBe(ben.id);
  });

  it("a ban is the last resort: no sign-in, out of search, until lifted; team accounts can't be banned", async () => {
    const { ana, ben, admin } = await cast();
    signInAs(ana);
    await fileReport(ben.id, { reason: "CHEATING" });
    signInAs(admin);
    expect((await decideFor(ben.id, { action: "BANNED", note: "Reused proof photos" })).status).toBe(200);
    expect(await verifyCredentials("ben@test.ph", "right-pass-1", new Date(Date.now() + 365 * 86_400_000))).toEqual({
      ok: false,
      code: "restricted",
    });

    signInAs(ana);
    const { results } = await (await search(new Request("http://test.local/api/users/search?q=ben"))).json();
    expect(results).toEqual([]);

    signInAs(admin);
    expect((await decideFor(admin.id, { action: "BANNED" })).status).toBe(400);
  });
});
