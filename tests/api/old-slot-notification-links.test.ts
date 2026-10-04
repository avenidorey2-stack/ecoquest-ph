import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSlot, createUser, resetDb } from "../helpers";

beforeEach(resetDb);

const MIGRATION = readFileSync(
  path.join(process.cwd(), "prisma/migrations/20261005140000_link_old_slot_notifications/migration.sql"),
  "utf8",
);
const SECOND = 1000;

describe("migration: link old new-slot notifications to the map", () => {
  it("points each old notice at its own slot, read or not, and leaves the rest alone", async () => {
    const user = await createUser();
    const t = new Date("2026-09-01T00:00:00Z").getTime();
    const narra = await createSlot({ requiredPlantType: "Narra", createdAt: new Date(t) });
    const narra2 = await createSlot({ requiredPlantType: "Narra", createdAt: new Date(t + 60 * 60 * SECOND) });
    const molave = await createSlot({ requiredPlantType: "Molave", createdAt: new Date(t + 5 * SECOND) });
    const note = (message: string, at: number, extra: { link?: string | null; isRead?: boolean } = {}) =>
      prisma.notification.create({ data: { userId: user.id, message, createdAt: new Date(at), link: "/dashboard", ...extra } });

    const first = await note("New planting slot available in Quezon City: Narra · 10 pts/plant.", t + 50, { isRead: true });
    const second = await note("New planting slot available in Quezon City: Narra · 10 pts/plant.", t + 60 * 60 * SECOND + 80);
    const third = await note("New planting slot available in Quezon City: Molave · 10 pts/plant.", t + 5 * SECOND + 10, { link: null });
    const renamed = await note("New planting slot available in Quezon City: Kamagong · 10 pts/plant.", t + 100);
    const other = await note("Tree approved! +10 pts", t + 200);

    await prisma.$executeRawUnsafe(MIGRATION);

    const link = async (id: string) => (await prisma.notification.findUniqueOrThrow({ where: { id } })).link;
    expect(await link(first.id)).toBe(`/dashboard?slot=${narra.id}`);
    expect(await link(second.id)).toBe(`/dashboard?slot=${narra2.id}`);
    expect(await link(third.id)).toBe(`/dashboard?slot=${molave.id}`);
    expect(await link(renamed.id)).toBe("/dashboard");
    expect(await link(other.id)).toBe("/dashboard");
  });
});
