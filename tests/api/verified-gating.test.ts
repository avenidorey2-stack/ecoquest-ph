import { beforeEach, describe, expect, it } from "vitest";
import { POST as claimSlot } from "@/app/api/slots/[id]/claim/route";
import { POST as submitProof } from "@/app/api/quests/[id]/verifications/route";
import { POST as redeem } from "@/app/api/rewards/[id]/redeem/route";
import { POST as claimReferral } from "@/app/api/referrals/claim/route";
import { prisma } from "@/lib/prisma";
import { createSlot, createUser, ctx, jpeg, jsonRequest, resetDb, signInAs, uploadRequest } from "../helpers";

beforeEach(resetDb);

describe("unverified accounts can't earn or spend", () => {
  it("blocks claiming, proof uploads, redemptions and invite codes with 403", async () => {
    const user = await createUser({ emailVerified: null, points: 10_000 });
    const referrer = await createUser();
    const slot = await createSlot();
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id } });
    const reward = await prisma.reward.create({
      data: { rewardType: "VOUCHER", brand: "Grab", costPoints: 100, valuePesos: 50 },
    });
    signInAs(user);

    const responses = [
      await claimSlot(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id })),
      await submitProof(uploadRequest(jpeg(), 1), ctx({ id: quest.id })),
      await redeem(jsonRequest({}), ctx({ id: reward.id })),
      await claimReferral(jsonRequest({ code: referrer.referralCode })),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/verify your email/);
    }

    expect(await prisma.quest.count()).toBe(1);
    expect(await prisma.verification.count()).toBe(0);
    expect(await prisma.redemptionHistory.count()).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).points).toBe(10_000);
  });

  it("verified accounts are unaffected", async () => {
    signInAs(await createUser());
    const slot = await createSlot();
    expect((await claimSlot(new Request("http://test.local", { method: "POST" }), ctx({ id: slot.id }))).status).toBe(201);
  });
});
