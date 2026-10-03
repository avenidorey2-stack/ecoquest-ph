import { beforeEach, describe, expect, it } from "vitest";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as celebrate } from "@/app/api/quests/[id]/celebrate/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { GET as getMedia } from "@/app/api/media/[key]/route";
import { prisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import { createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

async function setup({ pointsPerPlant = 10 } = {}) {
  const user = await createUser();
  const admin = await createUser({ role: "ADMIN" });
  const slot = await createSlot({ pointsPerPlant });
  const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id } });
  return { user, admin, slot, quest };
}

async function submit(questId: string, file: File | null = jpeg(), plantCount: string | number = 3) {
  return submitProof(uploadRequest(file, plantCount), ctx({ id: questId }));
}

async function reviewAs(adminId: string, verificationId: string, body: object) {
  signInAs({ id: adminId, role: "ADMIN" });
  return review(jsonRequest(body), ctx({ id: verificationId }));
}

describe("POST /api/quests/:id/verifications", () => {
  it("stores proof and moves the quest to PENDING_VERIFICATION", async () => {
    const { user, quest } = await setup();
    signInAs(user);

    const res = await submit(quest.id, jpeg(), 3);
    expect(res.status).toBe(201);
    const { verification } = await res.json();
    expect(verification).toMatchObject({ status: "PENDING", mediaType: "image/jpeg" });
    expect(verification.mediaUrl).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.jpg$/);

    const updated = await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } });
    expect(updated).toMatchObject({ status: "PENDING_VERIFICATION", plantCount: 0 }); // progress counts only approved plants
    expect(verification.plantCount).toBe(3); // the submission carries its own count
  });

  it("rejects missing files, bad types, oversized files and bad plant counts", async () => {
    const { user, quest } = await setup();
    signInAs(user);

    expect((await submit(quest.id, null)).status).toBe(400);
    expect((await submit(quest.id, new File(["x"], "a.gif", { type: "image/gif" }))).status).toBe(400);
    expect((await submit(quest.id, jpeg(11 * 1024 * 1024))).status).toBe(400);
    for (const count of [0, -1, 1.5, 501, "abc"]) {
      expect((await submit(quest.id, jpeg(), count)).status).toBe(400);
    }
    expect(await prisma.verification.count()).toBe(0);
  });

  it("hides other users' quests", async () => {
    const { quest } = await setup();
    signInAs(await createUser());
    expect((await submit(quest.id)).status).toBe(404);
  });

  it("notifies every admin that there's proof to review", async () => {
    const { user, admin, quest } = await setup();
    const admin2 = await createUser({ role: "ADMIN" });
    await prisma.user.update({ where: { id: user.id }, data: { name: "Maria" } });
    signInAs(user);
    expect((await submit(quest.id, jpeg(), 3)).status).toBe(201);

    for (const a of [admin, admin2]) {
      expect(await prisma.notification.findMany({ where: { userId: a.id }, select: { message: true, link: true, isRead: true } })).toEqual([
        { message: "New proof to review: Maria submitted 3 Narra in Quezon City.", link: "/admin/verifications", isRead: false },
      ]);
    }
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(0); // the planter isn't told

    // A refused submission (one is already pending) sends nothing more.
    expect((await submit(quest.id)).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(1);
  });

  it("an admin planting themselves notifies the other admins, not themselves", async () => {
    const { admin } = await setup();
    const other = await createUser({ role: "ADMIN" });
    const quest = await prisma.quest.create({ data: { userId: admin.id, slotId: (await createSlot()).id } });
    signInAs({ id: admin.id, role: "ADMIN" });
    expect((await submit(quest.id)).status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: admin.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: other.id } })).toBe(1);
  });

  it("falls back to a generic name when the planter has none", async () => {
    const { user, admin, quest } = await setup();
    await prisma.user.update({ where: { id: user.id }, data: { name: null } });
    signInAs(user);
    await submit(quest.id, jpeg(), 1);
    const [n] = await prisma.notification.findMany({ where: { userId: admin.id } });
    expect(n.message).toBe("New proof to review: A planter submitted 1 Narra in Quezon City.");
  });

  it("blocks a second submission while one is pending", async () => {
    const { user, quest } = await setup();
    signInAs(user);
    expect((await submit(quest.id)).status).toBe(201);
    expect((await submit(quest.id)).status).toBe(409);
    expect(await prisma.verification.count()).toBe(1);
  });
});

describe("POST /api/admin/verifications/:id/review", () => {
  it("is admin-only", async () => {
    const { user, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id)).json();

    // Even with a forged ADMIN role in the session, the DB role is what counts.
    signInAs({ id: user.id, role: "ADMIN" });
    const res = await review(jsonRequest({ action: "approve" }), ctx({ id: verification.id }));
    expect(res.status).toBe(403);
  });

  it("approves: awards plants × pointsPerPlant, completes the quest and chains the next", async () => {
    const { user, admin, slot, quest } = await setup({ pointsPerPlant: 15 });
    signInAs(user);
    const { verification } = await (await submit(quest.id, jpeg(), 4)).json();

    const res = await reviewAs(admin.id, verification.id, { action: "approve" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pointsAwarded).toBe(60);
    expect(body.nextQuest).toMatchObject({ userId: user.id, slotId: slot.id, status: "ACTIVE" });

    const done = await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } });
    expect(done).toMatchObject({ status: "COMPLETED", pointsAwarded: 60, plantCount: 4 });
    expect(done.completedAt).not.toBeNull();

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u).toMatchObject({ points: 60, weeklyPoints: 60, totalPlants: 4, weeklyPointsWeekStart: weekStart() });

    const v = await prisma.verification.findUniqueOrThrow({ where: { id: verification.id } });
    expect(v).toMatchObject({ status: "APPROVED", reviewedById: admin.id });
  });

  it("lets the admin correct the plant count", async () => {
    const { user, admin, quest } = await setup({ pointsPerPlant: 10 });
    signInAs(user);
    const { verification } = await (await submit(quest.id, jpeg(), 10)).json();

    const res = await reviewAs(admin.id, verification.id, { action: "approve", plantCount: 7 });
    expect((await res.json()).pointsAwarded).toBe(70);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).totalPlants).toBe(7);
  });

  it("cannot approve the same verification twice", async () => {
    const { user, admin, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id, jpeg(), 2)).json();

    expect((await reviewAs(admin.id, verification.id, { action: "approve" })).status).toBe(200);
    expect((await reviewAs(admin.id, verification.id, { action: "approve" })).status).toBe(409);
    expect((await reviewAs(admin.id, verification.id, { action: "reject" })).status).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(20);
  });

  it("does not chain a new quest when the slot is no longer open", async () => {
    const { user, admin, slot, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id)).json();
    await prisma.slot.update({ where: { id: slot.id }, data: { status: "FULL" } });

    const body = await (await reviewAs(admin.id, verification.id, { action: "approve" })).json();
    expect(body.nextQuest).toBeNull();
    expect(await prisma.quest.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(0);
  });

  it("rejects: records the reason, reopens the quest and awards nothing", async () => {
    const { user, admin, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id)).json();

    const res = await reviewAs(admin.id, verification.id, { action: "reject", reason: "Photo is blurry" });
    expect(res.status).toBe(200);

    expect(await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await prisma.verification.findUniqueOrThrow({ where: { id: verification.id } })).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Photo is blurry",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(0);

    // The user can resubmit.
    signInAs(user);
    expect((await submit(quest.id)).status).toBe(201);
  });

  it("validates the action and plant count", async () => {
    const { user, admin, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id)).json();

    expect((await reviewAs(admin.id, verification.id, { action: "maybe" })).status).toBe(400);
    expect((await reviewAs(admin.id, verification.id, { action: "approve", plantCount: 0 })).status).toBe(400);
  });
});

describe("POST /api/quests/:id/celebrate", () => {
  it("marks a completed quest as celebrated, once, for its owner only", async () => {
    const { user, quest } = await setup();
    await prisma.quest.update({ where: { id: quest.id }, data: { status: "COMPLETED" } });

    signInAs(await createUser());
    await celebrate(new Request("http://test.local"), ctx({ id: quest.id }));
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).celebratedAt).toBeNull();

    signInAs(user);
    await celebrate(new Request("http://test.local"), ctx({ id: quest.id }));
    const first = (await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).celebratedAt;
    expect(first).not.toBeNull();

    await celebrate(new Request("http://test.local"), ctx({ id: quest.id }));
    expect((await prisma.quest.findUniqueOrThrow({ where: { id: quest.id } })).celebratedAt).toEqual(first);
  });
});

describe("GET /api/media/:key", () => {
  it("serves proof to its owner and admins only", async () => {
    const { user, admin, quest } = await setup();
    signInAs(user);
    const { verification } = await (await submit(quest.id, jpeg(2048))).json();
    const key = verification.mediaUrl.split("/").pop();
    const fetchMedia = () => getMedia(new Request("http://test.local"), ctx({ key }));

    const own = await fetchMedia();
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/jpeg");
    expect((await own.arrayBuffer()).byteLength).toBe(2048);

    signInAs(admin);
    expect((await fetchMedia()).status).toBe(200);

    signInAs(await createUser());
    expect((await fetchMedia()).status).toBe(404);

    signInAs(null);
    expect((await fetchMedia()).status).toBe(401);
  });

  it("rejects path traversal keys", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await getMedia(new Request("http://test.local"), ctx({ key: "../../.env" }));
    expect(res.status).toBe(404);
  });
});
