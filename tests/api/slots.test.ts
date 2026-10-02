import { beforeEach, describe, expect, it } from "vitest";
import { GET as listSlots } from "@/app/api/slots/route";
import { POST as claimSlot } from "@/app/api/slots/[id]/claim/route";
import { prisma } from "@/lib/prisma";
import { CODES, createSlot, createUser, ctx, resetDb, signInAs } from "../helpers";

const claim = (slotId: string) => claimSlot(new Request("http://test.local", { method: "POST" }), ctx({ id: slotId }));

beforeEach(resetDb);

describe("POST /api/slots/:id/claim", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await claim("x")).status).toBe(401);
  });

  it("requires the user to have a home city", async () => {
    const user = await createUser({ cityCode: null });
    const slot = await createSlot();
    signInAs(user);
    expect((await claim(slot.id)).status).toBe(400);
  });

  it("returns 404 for an unknown slot", async () => {
    signInAs(await createUser());
    expect((await claim("missing")).status).toBe(404);
  });

  it.each(["FULL", "CLOSED"] as const)("rejects %s slots", async (status) => {
    signInAs(await createUser());
    const slot = await createSlot({ status });
    expect((await claim(slot.id)).status).toBe(409);
  });

  it("geofences: rejects slots in another city", async () => {
    signInAs(await createUser());
    const slot = await createSlot({ city: "City of Makati", cityCode: CODES.makati });
    const res = await claim(slot.id);
    expect(res.status).toBe(403);
    expect(await prisma.quest.count()).toBe(0);
  });

  it("geofences: rejects a same-named city in another province", async () => {
    signInAs(await createUser({ city: "San Jose", cityCode: CODES.sanJoseBatangas }));
    const slot = await createSlot({ city: "San Jose", cityCode: CODES.sanJoseTarlac });
    expect((await claim(slot.id)).status).toBe(403);
  });

  it("creates an ACTIVE quest for an in-city slot", async () => {
    const user = await createUser();
    const slot = await createSlot();
    signInAs(user);

    const res = await claim(slot.id);
    expect(res.status).toBe(201);
    const { quest } = await res.json();
    expect(quest).toMatchObject({ userId: user.id, slotId: slot.id, status: "ACTIVE" });
  });

  it("prevents the same user claiming a slot twice", async () => {
    signInAs(await createUser());
    const slot = await createSlot();
    expect((await claim(slot.id)).status).toBe(201);
    expect((await claim(slot.id)).status).toBe(409);
  });

  it("allows multiple users to share one slot", async () => {
    const slot = await createSlot();
    for (const user of [await createUser(), await createUser(), await createUser()]) {
      signInAs(user);
      expect((await claim(slot.id)).status).toBe(201);
    }
    expect(await prisma.quest.count({ where: { slotId: slot.id } })).toBe(3);
  });
});

describe("GET /api/slots", () => {
  const list = (query = "") => listSlots(new Request(`http://test.local/api/slots${query}`));

  it("requires a session", async () => {
    signInAs(null);
    expect((await list()).status).toBe(401);
  });

  it("?scope=city returns only slots in the user's home city", async () => {
    const user = await createUser();
    const mine = await createSlot();
    await createSlot({ cityCode: CODES.makati });
    signInAs(user);

    const { slots } = await (await list("?scope=city")).json();
    expect(slots.map((s: { id: string }) => s.id)).toEqual([mine.id]);
  });

  it("?scope=city returns nothing when no home city is set", async () => {
    await createSlot();
    signInAs(await createUser({ cityCode: null }));
    expect((await (await list("?scope=city")).json()).slots).toEqual([]);
  });

  it("flags claimability per user and hides closed slots", async () => {
    const user = await createUser();
    const other = await createUser();
    const mine = await createSlot();
    const claimed = await createSlot();
    const elsewhere = await createSlot({ cityCode: CODES.makati });
    const full = await createSlot({ status: "FULL" });
    await createSlot({ status: "CLOSED" });
    await prisma.quest.create({ data: { userId: user.id, slotId: claimed.id } });
    await prisma.quest.create({ data: { userId: other.id, slotId: claimed.id } });

    signInAs(user);
    const { slots } = await (await list()).json();
    const byId = Object.fromEntries(slots.map((s: { id: string }) => [s.id, s]));

    expect(slots).toHaveLength(4);
    expect(byId[mine.id]).toMatchObject({ claimable: true, alreadyClaimed: false, participants: 0 });
    expect(byId[claimed.id]).toMatchObject({ claimable: false, alreadyClaimed: true, participants: 2 });
    expect(byId[elsewhere.id]).toMatchObject({ claimable: false });
    expect(byId[full.id]).toMatchObject({ claimable: false });
  });
});
