import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

// Supabase publishes "public" tables over its Data API; the app only uses Prisma, so every table
// must keep row level security on (migration 20261006140000_lock_data_api). A new table needs
// `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in its migration.
describe("Data API lock", () => {
  it("has row level security on for every public table", async () => {
    const tables = await prisma.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    expect(tables.length).toBeGreaterThan(20);
    expect(tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)).toEqual([]);
  });
});
