import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimSlot } from "@/app/api/slots/[id]/claim/route";
import { GET as listSlots } from "@/app/api/slots/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { POST as createSlotApi } from "@/app/api/admin/slots/route";
import { GET as listClaims } from "@/app/api/admin/slots/[id]/claims/route";
import { PATCH as setExpiry } from "@/app/api/admin/quests/[id]/route";
import { prisma } from "@/lib/prisma";
import { getDashboardData } from "@/lib/dashboard";
import { CLAIM_DAYS, CLAIM_EXPIRED, remindExpiringClaims } from "@/lib/quests";
import { GET as getNotifications } from "@/app/api/notifications/route";
import { createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

const DAY_MS = 24 * 60 * 60 * 1000;
const claim = (slotId: string) => claimSlot(new Request("http://test.local", { method: "POST" }), ctx({ id: slotId }));
const submit = (questId: string) => submitProof(uploadRequest(jpeg(), 1), ctx({ id: questId }));
const list = () => listSlots(new Request("http://test.local/api/slots?scope=city"));
const patchExpiry = (questId: string, expiresAt: unknown) => setExpiry(jsonRequest({ expiresAt }, "PATCH"), ctx({ id: questId }));
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);
/** "YYYY-MM-DD" in Philippine time, `days` from now. */
const phDay = (days: number) => new Date(Date.now() + days * DAY_MS).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

describe("claim expiry", () => {
  it("a claim lasts 7 days", async () => {
    const user = await createUser();
    const slot = await createSlot();
    signInAs(user);
    const before = Date.now();
    const res = await claim(slot.id);
    expect(res.status).toBe(201);
    const quest = await prisma.quest.findFirstOrThrow({ where: { userId: user.id } });
    const ms = quest.expiresAt!.getTime() - before;
    expect(ms).toBeGreaterThanOrEqual(CLAIM_DAYS * DAY_MS);
    expect(ms).toBeLessThan(CLAIM_DAYS * DAY_MS + 60_000);
  });

  it("refuses proof once the claim has expired, and accepts it again after an admin extends it", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const slot = await createSlot();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, expiresAt: ago(1) } });

    signInAs(user);
    const refused = await submit(quest.id);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe(CLAIM_EXPIRED);
    expect(await prisma.verification.count()).toBe(0);

    signInAs(admin);
    const extended = await patchExpiry(quest.id, phDay(3));
    expect(extended.status).toBe(200);
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(note.message).toContain("active again");

    signInAs(user);
    expect((await submit(quest.id)).status).toBe(201);
  });

  it("an expired claim frees its spot but the planter can't re-claim the slot", async () => {
    const slot = await createSlot({ maxParticipants: 1 });
    const late = await createUser();
    await prisma.quest.create({ data: { userId: late.id, slotId: slot.id, expiresAt: ago(1) } });

    signInAs(late);
    const again = await claim(slot.id);
    expect(again.status).toBe(409);
    expect((await again.json()).error).toMatch(/expired/);
    const [shown] = (await (await list()).json()).slots;
    expect(shown).toMatchObject({ claimExpired: true, alreadyClaimed: false, claimable: false, participants: 0, spotsLeft: 1 });

    signInAs(await createUser());
    expect((await claim(slot.id)).status).toBe(201);
  });

  it("proof awaiting review still holds a spot after the deadline", async () => {
    const slot = await createSlot({ maxParticipants: 1 });
    const user = await createUser();
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "PENDING_VERIFICATION", expiresAt: ago(1) } });
    signInAs(await createUser());
    expect((await claim(slot.id)).status).toBe(409);
  });

  it("the next quest after a completed one keeps the claim's deadline", async () => {
    const user = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const slot = await createSlot({ questGoal: 1 });
    const expiresAt = new Date(Date.now() + 3 * DAY_MS);
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, targetPlants: 1, expiresAt } });

    signInAs(user);
    const { verification } = await (await submit(quest.id)).json();
    signInAs(admin);
    expect((await review(jsonRequest({ action: "approve" }), ctx({ id: verification.id }))).status).toBe(200);

    const next = await prisma.quest.findFirstOrThrow({ where: { userId: user.id, status: "ACTIVE" } });
    expect(next.id).not.toBe(quest.id);
    expect(next.expiresAt).toEqual(expiresAt);
  });

  it("the dashboard shows an expired claim without the proof upload", async () => {
    const user = await createUser();
    const slot = await createSlot();
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, expiresAt: ago(1) } });
    const d = await getDashboardData(user.id);
    const card = d.quests.find((q) => q.kind === "planting")!;
    expect(card.uploadQuestId).toBeUndefined();
    expect(card.claim).toMatchObject({ expired: true });
    expect(card.detail).toContain("claim expired");
  });
});

describe("admin claim deadlines", () => {
  it("lists a slot's claims, admins only", async () => {
    const slot = await createSlot();
    const user = await createUser({ name: "Maria" });
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, expiresAt: ago(1) } });
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "COMPLETED" } });

    signInAs(user);
    expect((await listClaims(new Request("http://test.local"), ctx({ id: slot.id }))).status).toBe(403);

    signInAs(await createUser({ role: "ADMIN" }));
    const { claims } = await (await listClaims(new Request("http://test.local"), ctx({ id: slot.id }))).json();
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ expired: true, user: { name: "Maria" } });
  });

  it("sets the deadline to the end of the chosen day in Philippine time", async () => {
    const slot = await createSlot();
    const user = await createUser();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, expiresAt: new Date(Date.now() + DAY_MS) } });
    signInAs(await createUser({ role: "ADMIN" }));

    expect((await patchExpiry(quest.id, "2026-10-20")).status).toBe(200);
    const updated = await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } });
    expect(updated.expiresAt!.toISOString()).toBe("2026-10-20T15:59:59.999Z");
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: user.id } });
    expect(note.message).toContain("now lasts until Oct 20, 2026");
  });

  it("rejects bad dates, ended quests and non-admins", async () => {
    const slot = await createSlot();
    const user = await createUser();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id } });
    const done = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "COMPLETED" } });

    signInAs(user);
    expect((await patchExpiry(quest.id, phDay(3))).status).toBe(403);

    signInAs(await createUser({ role: "ADMIN" }));
    for (const bad of ["", "tomorrow", "2026-02-31", 42, phDay(400)]) {
      expect((await patchExpiry(quest.id, bad)).status).toBe(400);
    }
    expect((await patchExpiry(done.id, phDay(3))).status).toBe(409);
    expect((await patchExpiry("missing", phDay(3))).status).toBe(404);
  });
});

describe("new slot notification", () => {
  it("links to the slot on the dashboard map", async () => {
    const planter = await createUser();
    signInAs(await createUser({ role: "ADMIN", cityCode: null }));
    const res = await createSlotApi(
      jsonRequest({
        latitude: 14.676,
        longitude: 121.0437,
        region: "National Capital Region",
        province: "Metro Manila",
        city: "Quezon City",
        cityCode: planter.cityCode,
        requiredPlantType: "Narra",
        pointsPerPlant: 10,
      }),
    );
    expect(res.status).toBe(201);
    const { slot } = await res.json();
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: planter.id } });
    expect(note.link).toBe(`/dashboard?slot=${slot.id}`);
  });
});

describe("claim ending reminder", () => {
  const reminders = (userId: string) => prisma.notification.findMany({ where: { userId, message: { contains: "Less than a day left" } } });

  it("reminds once when less than a day is left, via the notifications check", async () => {
    const user = await createUser();
    const slot = await createSlot();
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, expiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000) } });
    signInAs(user);

    const { notifications, unreadCount } = await (await getNotifications()).json();
    expect(unreadCount).toBe(1);
    expect(notifications[0].message).toContain("Less than a day left! Your claim on the Narra slot in Quezon City ends");
    await getNotifications();
    await remindExpiringClaims(user.id);
    expect(await reminders(user.id)).toHaveLength(1);
  });

  it("skips claims with more than a day left, expired ones and proof in review", async () => {
    const user = await createUser();
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id, expiresAt: new Date(Date.now() + 2 * DAY_MS) } });
    await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id, expiresAt: ago(1) } });
    await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id, status: "PENDING_VERIFICATION", expiresAt: soon } });
    await prisma.quest.create({ data: { userId: user.id, slotId: (await createSlot()).id } });
    await remindExpiringClaims(user.id);
    expect(await reminders(user.id)).toHaveLength(0);
  });

  it("a new end date from an admin allows a new reminder", async () => {
    const user = await createUser();
    const quest = await prisma.quest.create({
      data: { userId: user.id, slotId: (await createSlot()).id, expiresAt: new Date(Date.now() + 60 * 60 * 1000), expiryRemindedAt: new Date() },
    });
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await patchExpiry(quest.id, phDay(3))).status).toBe(200);
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).expiryRemindedAt).toBeNull();
  });
});
