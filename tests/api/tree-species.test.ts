import { beforeEach, describe, expect, it } from "vitest";
import { POST as review } from "@/app/api/admin/verifications/[id]/review/route";
import { POST as createSlotRoute } from "@/app/api/admin/slots/route";
import { PATCH as updateSlotRoute } from "@/app/api/admin/slots/[id]/route";
import { GET as impactRoute } from "@/app/api/impact/route";
import { GET as artRoute } from "@/app/api/trees/art/[slug]/route";
import { getPlantingImpact } from "@/lib/impact";
import { prisma } from "@/lib/prisma";
import { seedTreeData, syncTreeSpecies } from "@/lib/species";
import { CODES, createSlot, createUser, ctx, jsonRequest, resetDb, signInAs } from "../helpers";

beforeEach(async () => {
  await resetDb();
  await syncTreeSpecies(prisma);
});

const species = (slug: string) => prisma.treeSpecies.findUniqueOrThrow({ where: { slug } });

async function submit(userId: string, slotId: string, plantCount: number) {
  const quest = await prisma.quest.create({ data: { userId, slotId, status: "PENDING_VERIFICATION" } });
  return prisma.verification.create({
    data: { questId: quest.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount },
  });
}

async function approve(verificationId: string) {
  signInAs(await createUser({ role: "ADMIN", email: `admin-${crypto.randomUUID()}@test.ph` }));
  const res = await review(jsonRequest({ action: "approve" }), ctx({ id: verificationId }));
  expect(res.status).toBe(200);
  return res.json();
}

describe("approval records plantings", () => {
  it("creates a PlantedTree with species + PSGC code and increments the species total", async () => {
    const narra = await species("narra");
    const user = await createUser();
    const slot = await createSlot({ speciesId: narra.id, requiredPlantType: "Narra" });
    const v = await submit(user.id, slot.id, 7);

    const body = await approve(v.id);
    expect(body.speciesId).toBe(narra.id);
    expect(await prisma.plantedTree.findUniqueOrThrow({ where: { verificationId: v.id } })).toMatchObject({
      userId: user.id,
      speciesId: narra.id,
      psgcCode: CODES.quezonCity,
      count: 7,
    });
    expect((await species("narra")).totalPlanted).toBe(7);
  });

  it("links legacy free-text slots by name", async () => {
    const user = await createUser();
    const slot = await createSlot({ requiredPlantType: "Bakawan (mangrove)" });
    await approve((await submit(user.id, slot.id, 4)).id);
    expect((await species("bakauan")).totalPlanted).toBe(4);
  });

  it("records custom species without touching any catalogue total", async () => {
    const user = await createUser();
    const slot = await createSlot({ requiredPlantType: "Acacia mangium" });
    const v = await submit(user.id, slot.id, 3);
    await approve(v.id);
    expect((await prisma.plantedTree.findUniqueOrThrow({ where: { verificationId: v.id } })).speciesId).toBeNull();
    const totals = await prisma.treeSpecies.aggregate({ _sum: { totalPlanted: true } });
    expect(totals._sum.totalPlanted).toBe(0);
  });
});

describe("planting impact", () => {
  it("totals national and local (by PSGC code) plantings", async () => {
    const narra = await species("narra");
    const qc = await createUser();
    const makati = await createUser({ cityCode: CODES.makati, city: "City of Makati" });
    await approve((await submit(qc.id, (await createSlot({ speciesId: narra.id })).id, 30)).id);
    await approve((await submit(makati.id, (await createSlot({ speciesId: narra.id, cityCode: CODES.makati })).id, 10)).id);

    expect(await getPlantingImpact(CODES.quezonCity)).toEqual({ national: 40, local: 30, localSharePct: 75 });
    expect(await getPlantingImpact(CODES.makati)).toEqual({ national: 40, local: 10, localSharePct: 25 });
    expect(await getPlantingImpact(null)).toEqual({ national: 40, local: 0, localSharePct: 0 });
  });

  it("is all zeros with no plantings", async () => {
    expect(await getPlantingImpact(CODES.quezonCity)).toEqual({ national: 0, local: 0, localSharePct: 0 });
  });

  it("GET /api/impact returns the viewer's city stats", async () => {
    signInAs(await createUser());
    const res = await impactRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ national: 0, local: 0, localSharePct: 0, city: "Quezon City" });
    signInAs(null);
    expect((await impactRoute()).status).toBe(401);
  });
});

describe("seedTreeData", () => {
  it("upserts 24 species, keeps live totals, and is idempotent", async () => {
    await prisma.treeSpecies.update({ where: { slug: "narra" }, data: { description: "stale", plantingGoal: 5000 } });
    await seedTreeData(prisma);
    await seedTreeData(prisma);
    expect(await prisma.treeSpecies.count()).toBe(24);
    const narra = await species("narra");
    expect(narra.description).not.toBe("stale"); // content refreshed from code
    expect(narra.plantingGoal).toBe(5000); // admin-tuned goal kept
    expect(narra.imageUrl).toBe("/api/trees/art/narra");
  });

  it("back-fills plantings approved before planting records existed, and recomputes totals", async () => {
    const user = await createUser();
    const slot = await createSlot({ requiredPlantType: "Narra" }); // legacy: no speciesId
    const quest = await prisma.quest.create({ data: { userId: user.id, slotId: slot.id, status: "COMPLETED", plantCount: 12 } });
    await prisma.verification.create({
      data: { questId: quest.id, mediaUrl: `/api/media/${crypto.randomUUID()}.jpg`, mediaType: "image/jpeg", plantCount: 12, status: "APPROVED", reviewedAt: new Date() },
    });
    await prisma.treeSpecies.update({ where: { slug: "narra" }, data: { totalPlanted: 999 } }); // drifted counter

    expect(await seedTreeData(prisma)).toMatchObject({ species: 24, linkedSlots: 1, backfilled: 1 });
    expect((await species("narra")).totalPlanted).toBe(12);
    expect((await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } })).speciesId).toBe((await species("narra")).id);

    expect(await seedTreeData(prisma)).toMatchObject({ linkedSlots: 0, backfilled: 0 });
    expect((await species("narra")).totalPlanted).toBe(12);
  });
});

describe("admin slots with species", () => {
  const body = { latitude: 14.676, longitude: 121.0437, cityCode: CODES.quezonCity, pointsPerPlant: 10 };

  it("creates a slot from a catalogue species", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const molave = await species("molave");
    const res = await createSlotRoute(jsonRequest({ ...body, speciesId: molave.id }));
    expect(res.status).toBe(201);
    expect((await res.json()).slot).toMatchObject({ speciesId: molave.id, requiredPlantType: "Molave" });
  });

  it("rejects unknown species ids", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    expect((await createSlotRoute(jsonRequest({ ...body, speciesId: "nope" }))).status).toBe(400);
  });

  it("links free-text species names when they match", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const res = await createSlotRoute(jsonRequest({ ...body, requiredPlantType: "Talisay" }));
    expect((await res.json()).slot.speciesId).toBe((await species("talisay")).id);
  });

  it("changes a slot's species", async () => {
    signInAs(await createUser({ role: "ADMIN" }));
    const slot = await createSlot();
    const pili = await species("pili");
    const res = await updateSlotRoute(jsonRequest({ speciesId: pili.id }, "PATCH"), ctx({ id: slot.id }));
    expect((await res.json()).slot).toMatchObject({ speciesId: pili.id, requiredPlantType: "Pili" });
  });
});

describe("GET /api/trees/art/:slug", () => {
  it("serves a cacheable SVG illustration", async () => {
    const res = await artRoute(new Request("http://test.local"), ctx({ slug: "narra" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(await res.text()).toMatch(/^<svg/);
  });

  it("404s for unknown species", async () => {
    expect((await artRoute(new Request("http://test.local"), ctx({ slug: "../etc" }))).status).toBe(404);
  });
});
