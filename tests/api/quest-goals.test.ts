import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimRoute } from "@/app/api/slots/[id]/claim/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { POST as createSlotRoute } from "@/app/api/admin/slots/route";
import { PATCH as updateSlotRoute } from "@/app/api/admin/slots/[id]/route";
import { prisma } from "@/lib/prisma";
import { CODES, createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

// Plants-per-quest goals: each approved submission adds exactly its plant count to the quest's
// progress; the quest completes automatically once the goal is met.

async function claim(user: { id: string }, slotId: string) {
  signInAs(user);
  const res = await claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: slotId }));
  expect(res.status).toBe(201);
  return (await res.json()).quest as { id: string; targetPlants: number };
}

async function submit(user: { id: string }, questId: string, plantCount: number) {
  signInAs(user);
  const res = await submitProof(uploadRequest(jpeg(), plantCount), ctx({ id: questId }));
  expect(res.status).toBe(201);
  return (await res.json()).verification as { id: string; plantCount: number };
}

async function approve(admin: { id: string }, verificationId: string, plantCount?: number) {
  signInAs({ id: admin.id, role: "ADMIN" });
  const res = await review(jsonRequest({ action: "approve", ...(plantCount ? { plantCount } : {}) }), ctx({ id: verificationId }));
  expect(res.status).toBe(200);
  return res.json();
}

const quest = (id: string) => prisma.quest.findUniqueOrThrow({ where: { id } });
const user = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

describe("quest plant goals", () => {
  it("copies the slot's goal onto a claimed quest", async () => {
    const slot = await createSlot({ questGoal: 5 });
    const q = await claim(await createUser(), slot.id);
    expect(q.targetPlants).toBe(5);
  });

  it("adds each approved batch to the progress and completes the quest when the goal is met", async () => {
    const planter = await createUser();
    const admin = await createUser({ role: "ADMIN" });
    const slot = await createSlot({ questGoal: 5, pointsPerPlant: 10 });
    const q = await claim(planter, slot.id);

    // Batch 1: 3 plants → 3/5, quest open again for more proof, no next quest yet.
    const first = await submit(planter, q.id, 3);
    expect(first.plantCount).toBe(3);
    expect(await quest(q.id)).toMatchObject({ status: "PENDING_VERIFICATION", plantCount: 0 });
    const r1 = await approve(admin, first.id);
    expect(r1).toMatchObject({ goalReached: false, pointsAwarded: 30, nextQuest: null });
    expect(await quest(q.id)).toMatchObject({ status: "ACTIVE", plantCount: 3, targetPlants: 5, pointsAwarded: 30, completedAt: null });
    expect(await user(planter.id)).toMatchObject({ points: 30, totalPlants: 3 });
    const partial = await prisma.notification.findFirstOrThrow({ where: { userId: planter.id }, orderBy: { createdAt: "desc" } });
    expect(partial.message).toContain("3/5 planted");

    // Batch 2: 2 plants → 5/5 → completed automatically; the next quest unlocks with the same goal.
    const second = await submit(planter, q.id, 2);
    const r2 = await approve(admin, second.id);
    expect(r2.goalReached).toBe(true);
    expect(await quest(q.id)).toMatchObject({ status: "COMPLETED", plantCount: 5, pointsAwarded: 50 });
    expect((await quest(q.id)).completedAt).not.toBeNull();
    expect(await user(planter.id)).toMatchObject({ points: 50, totalPlants: 5 });
    expect(r2.nextQuest).toMatchObject({ status: "ACTIVE", targetPlants: 5, plantCount: 0 });
  });

  it("one batch that covers the whole goal (or more) completes the quest at once", async () => {
    const planter = await createUser();
    const slot = await createSlot({ questGoal: 3, pointsPerPlant: 10 });
    const q = await claim(planter, slot.id);
    const v = await submit(planter, q.id, 4);
    await approve(await createUser({ role: "ADMIN" }), v.id);
    expect(await quest(q.id)).toMatchObject({ status: "COMPLETED", plantCount: 4, pointsAwarded: 40 });
  });

  it("counts the admin-approved quantity when it differs from the claim", async () => {
    const planter = await createUser();
    const slot = await createSlot({ questGoal: 5, pointsPerPlant: 10 });
    const q = await claim(planter, slot.id);
    const v = await submit(planter, q.id, 4);
    await approve(await createUser({ role: "ADMIN" }), v.id, 2);
    expect(await quest(q.id)).toMatchObject({ status: "ACTIVE", plantCount: 2, pointsAwarded: 20 });
    expect((await prisma.verification.findUniqueOrThrow({ where: { id: v.id } })).plantCount).toBe(2);
  });

  it("a rejected batch adds nothing", async () => {
    const planter = await createUser();
    const slot = await createSlot({ questGoal: 5 });
    const q = await claim(planter, slot.id);
    const v = await submit(planter, q.id, 3);
    signInAs(await createUser({ role: "ADMIN" }));
    await review(jsonRequest({ action: "reject", reason: "Blurry" }), ctx({ id: v.id }));
    expect(await quest(q.id)).toMatchObject({ status: "ACTIVE", plantCount: 0, pointsAwarded: 0 });
    expect((await user(planter.id)).totalPlants).toBe(0);
  });

  it("admins set plants per quest on create and edit (validated); edits apply to new claims only", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const base = { latitude: 14.676, longitude: 121.0437, cityCode: CODES.quezonCity, requiredPlantType: "Narra", pointsPerPlant: 10 };
    const created = await (await createSlotRoute(jsonRequest({ ...base, questGoal: 4 }))).json();
    expect(created.slot.questGoal).toBe(4);
    expect((await (await createSlotRoute(jsonRequest(base))).json()).slot.questGoal).toBe(1);
    for (const bad of [0, 501, 2.5, "3"]) {
      expect((await createSlotRoute(jsonRequest({ ...base, questGoal: bad }))).status).toBe(400);
    }

    const planter = await createUser();
    const q = await claim(planter, created.slot.id);
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await updateSlotRoute(jsonRequest({ questGoal: 8 }, "PATCH"), ctx({ id: created.slot.id }));
    expect((await res.json()).slot.questGoal).toBe(8);
    expect((await quest(q.id)).targetPlants).toBe(4); // in-flight quest keeps its goal
  });
});
