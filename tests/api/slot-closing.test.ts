import { beforeEach, describe, expect, it } from "vitest";
import { DELETE as deleteSlotRoute, PATCH as updateSlotRoute } from "@/app/api/admin/slots/[id]/route";
import { POST as claimRoute } from "@/app/api/slots/[id]/claim/route";
import { POST as submitProofRoute } from "@/app/api/quests/[id]/verifications/route";
import { POST as startUploadRoute } from "@/app/api/quests/[id]/verifications/upload/route";
import { POST as reviewRoute } from "@/app/api/admin/verifications/[id]/review/route";
import { prisma } from "@/lib/prisma";
import { SLOT_CLOSED } from "@/lib/quests";
import { syncTreeSpecies } from "@/lib/species";
import type { Role } from "@/generated/prisma/client";
import { createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

type User = { id: string; role?: Role };

const patch = (slotId: string, body: object) => updateSlotRoute(jsonRequest(body, "PATCH"), ctx({ id: slotId }));
const submit = (questId: string, plants = 1) => submitProofRoute(uploadRequest(jpeg(), plants), ctx({ id: questId }));
const quest = (id: string) => prisma.quest.findUniqueOrThrow({ where: { id } });
const notes = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { message: true, link: true } });
const points = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).points;

async function submitAs(user: User, questId: string, plants = 1) {
  signInAs(user);
  const res = await submit(questId, plants);
  expect(res.status).toBe(201);
  return (await res.json()).verification as { id: string; mediaUrl: string };
}

async function reviewAs(admin: User, verificationId: string, body: object) {
  signInAs(admin);
  return reviewRoute(jsonRequest(body), ctx({ id: verificationId }));
}

describe("closing a slot (admin sets status CLOSED)", () => {
  it("ends active quests, keeps proof awaiting review, and notifies exactly those planters", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const [active, waiting, done, bystander] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
    const slot = await createSlot({ requiredPlantType: "Narra", city: "Quezon City", questGoal: 3 });
    const activeQuest = await prisma.quest.create({ data: { userId: active.id, slotId: slot.id, targetPlants: 3 } });
    const waitingQuest = await prisma.quest.create({ data: { userId: waiting.id, slotId: slot.id, targetPlants: 3 } });
    await prisma.quest.create({ data: { userId: done.id, slotId: slot.id, status: "COMPLETED", completedAt: new Date() } });
    await submitAs(waiting, waitingQuest.id);
    await prisma.notification.deleteMany(); // ignore the "new proof" admin notice

    signInAs(admin);
    const res = await patch(slot.id, { status: "CLOSED" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slot.status).toBe("CLOSED");
    expect(body.closed).toEqual({ cancelledQuests: 1, awaitingReview: 1, notified: 2 });

    expect((await quest(activeQuest.id)).status).toBe("CANCELLED");
    expect((await quest(waitingQuest.id)).status).toBe("PENDING_VERIFICATION");
    expect(await notes(active.id)).toEqual([
      {
        message:
          "The Narra slot in Quezon City is now closed, so your quest there has ended. Plants and points already approved are yours to keep.",
        link: "/dashboard",
      },
    ]);
    expect(await notes(waiting.id)).toEqual([
      {
        message:
          "The Narra slot in Quezon City is now closed. Your proof awaiting review will still be reviewed, but no new proof can be submitted there.",
        link: "/dashboard",
      },
    ]);
    expect(await notes(done.id)).toEqual([]);
    expect(await notes(bystander.id)).toEqual([]);

    // Saving it again while closed, or editing other fields, ends nothing more and sends nothing.
    expect((await (await patch(slot.id, { status: "CLOSED" })).json()).closed).toBeNull();
    expect((await (await patch(slot.id, { pointsPerPlant: 25 })).json()).closed).toBeNull();
    expect(await prisma.notification.count()).toBe(2);
  });

  it("refuses new proof on a closed slot, on both upload paths", async () => {
    const planter = await createUser();
    const slot = await createSlot();
    const q = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id } });
    // Even a quest that somehow stayed ACTIVE (e.g. data from before this fix) can't take proof.
    await prisma.slot.update({ where: { id: slot.id }, data: { status: "CLOSED" } });

    signInAs(planter);
    const res = await submit(q.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(SLOT_CLOSED);
    const start = await startUploadRoute(jsonRequest({ type: "image/jpeg", size: 1024 }), ctx({ id: q.id }));
    expect(start.status).toBe(409);
    expect((await start.json()).error).toBe(SLOT_CLOSED);
    expect(await prisma.verification.count()).toBe(0);
    expect((await quest(q.id)).status).toBe("ACTIVE");
  });

  it("a part-done quest keeps its approved plants, proof, trees and points", async () => {
    await syncTreeSpecies(prisma);
    const admin = await createUser({ role: "ADMIN" });
    const planter = await createUser({ points: 0 });
    const slot = await createSlot({ pointsPerPlant: 10, questGoal: 5 });
    const q = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id, targetPlants: 5 } });
    const v = await submitAs(planter, q.id, 2);
    expect((await reviewAs(admin, v.id, { action: "approve" })).status).toBe(200);
    expect(await quest(q.id)).toMatchObject({ status: "ACTIVE", plantCount: 2 });

    signInAs(admin);
    expect((await (await patch(slot.id, { status: "CLOSED" })).json()).closed).toMatchObject({ cancelledQuests: 1 });
    expect(await quest(q.id)).toMatchObject({ status: "CANCELLED", plantCount: 2, pointsAwarded: 20 });
    expect(await prisma.verification.count({ where: { status: "APPROVED" } })).toBe(1);
    expect(await prisma.plantedTree.count()).toBe(1);
    expect(await points(planter.id)).toBe(20);
  });

  it("reviewing proof on a closed slot ends the quest instead of reopening it", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const [approved, rejected, finisher] = await Promise.all([createUser({ points: 0 }), createUser(), createUser()]);
    const slot = await createSlot({ pointsPerPlant: 10, questGoal: 3, requiredPlantType: "Narra" });
    const mk = (userId: string) => prisma.quest.create({ data: { userId, slotId: slot.id, targetPlants: 3 } });
    const [qa, qr, qf] = await Promise.all([mk(approved.id), mk(rejected.id), mk(finisher.id)]);
    const va = await submitAs(approved, qa.id, 1);
    const vr = await submitAs(rejected, qr.id, 1);
    const vf = await submitAs(finisher, qf.id, 3);

    signInAs(admin);
    expect((await (await patch(slot.id, { status: "CLOSED" })).json()).closed).toMatchObject({ cancelledQuests: 0, awaitingReview: 3 });

    // Approved short of the goal: points paid, quest ended.
    expect((await reviewAs(admin, va.id, { action: "approve" })).status).toBe(200);
    expect(await quest(qa.id)).toMatchObject({ status: "CANCELLED", plantCount: 1 });
    expect(await points(approved.id)).toBe(10);
    expect((await notes(approved.id)).at(-1)?.message).toBe(
      "Tree approved! +10 pts for 1 Narra — 1/3 planted. This slot is closed, so the quest has ended.",
    );

    // Rejected: ended, not reopened.
    expect((await reviewAs(admin, vr.id, { action: "reject", reason: "Blurry" })).status).toBe(200);
    expect((await quest(qr.id)).status).toBe("CANCELLED");
    expect((await notes(rejected.id)).at(-1)?.message).toBe(
      "Your Narra proof was not approved: Blurry. This slot is closed, so the quest has ended.",
    );

    // Goal reached: completes as normal, but no next quest is chained on the closed slot.
    expect((await reviewAs(admin, vf.id, { action: "approve" })).status).toBe(200);
    expect((await quest(qf.id)).status).toBe("COMPLETED");
    expect(await prisma.quest.count({ where: { userId: finisher.id } })).toBe(1);

    expect(await prisma.quest.count({ where: { slotId: slot.id, status: { in: ["ACTIVE", "PENDING_VERIFICATION"] } } })).toBe(0);
  });

  it("an open slot still reopens quests after a review (unchanged behaviour)", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const planter = await createUser();
    const slot = await createSlot({ questGoal: 3 });
    const q = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id, targetPlants: 3 } });
    const v1 = await submitAs(planter, q.id, 1);
    await reviewAs(admin, v1.id, { action: "approve" });
    expect((await quest(q.id)).status).toBe("ACTIVE");
    const v2 = await submitAs(planter, q.id, 1);
    await reviewAs(admin, v2.id, { action: "reject" });
    expect((await quest(q.id)).status).toBe("ACTIVE");
  });

  it("after reopening, the planter can claim the slot again", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const planter = await createUser();
    const slot = await createSlot();
    await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id } });
    signInAs(admin);
    await patch(slot.id, { status: "CLOSED" });

    signInAs(planter);
    const claim = () => claimRoute(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id }));
    expect((await claim()).status).toBe(409); // closed
    signInAs(admin);
    expect((await (await patch(slot.id, { status: "OPEN" })).json()).closed).toBeNull();
    signInAs(planter);
    expect((await claim()).status).toBe(201); // the cancelled quest doesn't count as "already active"
  });
});

describe("deleting a slot permanently", () => {
  it("cancels a part-done quest instead of erasing its approved proof and trees", async () => {
    await syncTreeSpecies(prisma);
    const admin = await createUser({ role: "ADMIN" });
    const planter = await createUser({ points: 0 });
    const slot = await createSlot({ pointsPerPlant: 10, questGoal: 5 });
    const q = await prisma.quest.create({ data: { userId: planter.id, slotId: slot.id, targetPlants: 5 } });
    const approved = await submitAs(planter, q.id, 2);
    await reviewAs(admin, approved.id, { action: "approve" });
    await submitAs(planter, q.id, 1); // a second batch awaiting review

    signInAs(admin);
    const res = await deleteSlotRoute(new Request("http://test.local/x?permanent=true", { method: "DELETE" }), ctx({ id: slot.id }));
    expect(await res.json()).toMatchObject({ deleted: true, keptApprovedHistory: true, deletedQuests: 1, deletedMedia: 1, notified: 1 });

    expect(await quest(q.id)).toMatchObject({ status: "CANCELLED", plantCount: 2 });
    expect(await prisma.verification.findMany({ select: { id: true, status: true } })).toEqual([{ id: approved.id, status: "APPROVED" }]);
    expect(await prisma.plantedTree.count()).toBe(1);
    expect(await points(planter.id)).toBe(20);
    expect((await notes(planter.id)).at(-1)?.message).toContain("is now closed, so your quest there has ended.");
  });
});
