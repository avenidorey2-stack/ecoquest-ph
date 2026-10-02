import { beforeEach, describe, expect, it } from "vitest";
import { PATCH as updateProfile } from "@/app/api/profile/route";
import { GET as regionTree } from "@/app/api/psgc/regions/[code]/route";
import { prisma } from "@/lib/prisma";
import { CODES, createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

const patch = (body: object) => updateProfile(jsonRequest(body, "PATCH"));
const DAY = 86_400_000;

beforeEach(resetDb);

describe("PATCH /api/profile", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await patch({ name: "X" })).status).toBe(401);
  });

  it("updates and trims the display name", async () => {
    const user = await createUser();
    signInAs(user);
    const res = await patch({ name: "  Maria Clara  " });
    expect(res.status).toBe(200);
    expect((await res.json()).user.name).toBe("Maria Clara");
  });

  it.each(["", "   ", "x".repeat(61), 42])("rejects name %j", async (name) => {
    signInAs(await createUser());
    expect((await patch({ name })).status).toBe(400);
  });

  it("sets the first home city from a PSGC code, with canonical names", async () => {
    const user = await createUser({ region: null, province: null, city: null, cityCode: null });
    signInAs(user);

    const res = await patch({ cityCode: CODES.sanJoseBatangas });
    expect(res.status).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved).toMatchObject({
      cityCode: CODES.sanJoseBatangas,
      city: "San Jose",
      province: "Batangas",
      region: "Region IV-A (CALABARZON)",
    });
    expect(saved.locationUpdatedAt).not.toBeNull();
  });

  it("rejects unknown city codes", async () => {
    signInAs(await createUser({ cityCode: null }));
    expect((await patch({ cityCode: "000000000" })).status).toBe(400);
    expect((await patch({ cityCode: 137404000 })).status).toBe(400);
  });

  it("enforces a 30-day cooldown between city changes", async () => {
    const user = await createUser({ locationUpdatedAt: new Date(Date.now() - 10 * DAY) });
    signInAs(user);

    const res = await patch({ cityCode: CODES.makati });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/change your city again/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).cityCode).toBe(CODES.quezonCity);
  });

  it("allows a change after the cooldown", async () => {
    const user = await createUser({ locationUpdatedAt: new Date(Date.now() - 31 * DAY) });
    signInAs(user);
    expect((await patch({ cityCode: CODES.makati })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).city).toBe("City of Makati");
  });

  it("blocks city changes while a quest is active or pending", async () => {
    const user = await createUser({ locationUpdatedAt: new Date(Date.now() - 60 * DAY) });
    const slot = await createSlot();
    await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "PENDING_VERIFICATION" } });
    signInAs(user);

    const res = await patch({ cityCode: CODES.makati });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/active quests/);
  });

  it("re-saving the same city is a no-op that doesn't restart the cooldown", async () => {
    const before = new Date(Date.now() - 5 * DAY);
    const user = await createUser({ locationUpdatedAt: before });
    signInAs(user);

    expect((await patch({ name: "Juan", cityCode: CODES.quezonCity })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).locationUpdatedAt).toEqual(before);
  });

  it("ignores attempts to set other fields", async () => {
    const user = await createUser();
    signInAs(user);
    await patch({ points: 999_999, role: "ADMIN", city: "Makati" });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved).toMatchObject({ points: 0, role: "USER", city: "Quezon City" });
  });
});

describe("GET /api/psgc/regions/:code", () => {
  it("returns provinces with their cities", async () => {
    const res = await regionTree(new Request("http://test.local"), ctx({ code: "040000000" }));
    expect(res.status).toBe(200);
    const { provinces } = await res.json();
    const batangas = provinces.find((p: { name: string }) => p.name === "Batangas");
    expect(batangas.cities).toContainEqual({ code: CODES.sanJoseBatangas, name: "San Jose" });
  });

  it("404s for unknown regions", async () => {
    expect((await regionTree(new Request("http://test.local"), ctx({ code: "x" }))).status).toBe(404);
  });
});
