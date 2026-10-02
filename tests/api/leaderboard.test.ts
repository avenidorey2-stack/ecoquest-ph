import { beforeEach, describe, expect, it } from "vitest";
import { GET as leaderboardRoute } from "@/app/api/leaderboard/route";
import { getLeaderboard } from "@/lib/leaderboard";
import { awardPoints } from "@/lib/points";
import { prisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import { CODES, createUser, resetDb, signInAs } from "../helpers";

const NOW = new Date("2026-10-07T07:30:00.000Z"); // Wednesday
const THIS_WEEK = weekStart(NOW);
const LAST_WEEK = new Date(THIS_WEEK.getTime() - 7 * 86_400_000);

/** A ranked user in Quezon City (default) with `points` earned this week. */
function planter(points: number, overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ weeklyPoints: points, weeklyPointsWeekStart: THIS_WEEK, ...overrides });
}

const get = (scope?: string) =>
  leaderboardRoute(new Request(`http://test.local/api/leaderboard${scope ? `?scope=${scope}` : ""}`));

beforeEach(resetDb);

describe("awardPoints", () => {
  it("adds to this week's score within the same week", async () => {
    const user = await planter(30);
    await prisma.$transaction((tx) => awardPoints(tx, user.id, 20, 2, NOW));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      points: 20,
      totalPlants: 2,
      weeklyPoints: 50,
      weeklyPointsWeekStart: THIS_WEEK,
    });
  });

  it("starts a fresh weekly score in a new week, keeping lifetime totals", async () => {
    const user = await createUser({ points: 500, weeklyPoints: 300, weeklyPointsWeekStart: LAST_WEEK });
    await prisma.$transaction((tx) => awardPoints(tx, user.id, 20, 2, NOW));
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      points: 520,
      weeklyPoints: 20,
      weeklyPointsWeekStart: THIS_WEEK,
    });
  });

  it("handles a first-ever award", async () => {
    const user = await createUser();
    await prisma.$transaction((tx) => awardPoints(tx, user.id, 15, 1, NOW));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).weeklyPoints).toBe(15);
  });

  // Needs a real Postgres: `prisma dev` (PGlite) serializes connections, so the race never
  // happens there — and concurrent connections can crash it. Opt in with TEST_DB_CONCURRENCY=1.
  it.runIf(process.env.TEST_DB_CONCURRENCY === "1")("doesn't lose points when two awards race across the week boundary", async () => {
    const user = await createUser({ weeklyPoints: 300, weeklyPointsWeekStart: LAST_WEEK });
    await Promise.all([
      prisma.$transaction((tx) => awardPoints(tx, user.id, 10, 1, NOW)),
      prisma.$transaction((tx) => awardPoints(tx, user.id, 7, 1, NOW)),
    ]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      points: 17,
      weeklyPoints: 17,
      totalPlants: 2,
    });
  });

  it("throws for unknown users", async () => {
    await expect(prisma.$transaction((tx) => awardPoints(tx, "missing", 5, 0, NOW))).rejects.toThrow(/not found/);
  });
});

describe("getLeaderboard", () => {
  it("ranks national users by this week's points, ignoring stale weeks, zero scores and staff", async () => {
    const a = await planter(100);
    const b = await planter(250, { cityCode: CODES.makati, city: "City of Makati" });
    await createUser({ weeklyPoints: 999, weeklyPointsWeekStart: LAST_WEEK }); // last week
    await planter(0); // nothing yet
    await planter(500, { role: "ADMIN" }); // staff
    await planter(400, { role: "PATRON" });

    const board = await getLeaderboard({ scope: "national", viewerId: a.id, now: NOW });
    expect(board.entries.map((e) => [e.userId, e.rank, e.weeklyPoints])).toEqual([
      [b.id, 1, 250],
      [a.id, 2, 100],
    ]);
    expect(board.totalRanked).toBe(2);
    expect(board.viewer).toEqual({ rank: 2, weeklyPoints: 100 });
    expect(board.entries[1].isViewer).toBe(true);
  });

  it("local scope only includes the viewer's city (by PSGC code)", async () => {
    const qc1 = await planter(50);
    const qc2 = await planter(80);
    await planter(900, { cityCode: CODES.makati });

    const board = await getLeaderboard({ scope: "local", cityCode: CODES.quezonCity, viewerId: qc1.id, now: NOW });
    expect(board.entries.map((e) => e.userId)).toEqual([qc2.id, qc1.id]);
    expect(board.viewer.rank).toBe(2);
  });

  it("gives tied scores the same rank (1, 2, 2, 4)", async () => {
    const users = [await planter(90), await planter(70), await planter(70), await planter(10)];
    const board = await getLeaderboard({ scope: "national", viewerId: users[0].id, now: NOW });
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
  });

  it("computes the viewer's rank when they're outside the top N", async () => {
    for (const pts of [500, 400, 300, 200]) await planter(pts);
    const me = await planter(200);
    const board = await getLeaderboard({ scope: "national", viewerId: me.id, limit: 2, now: NOW });
    expect(board.entries).toHaveLength(2);
    expect(board.totalRanked).toBe(5);
    expect(board.viewer).toEqual({ rank: 4, weeklyPoints: 200 }); // tied with the other 200
  });

  it("leaves unranked viewers without a rank", async () => {
    await planter(10);
    const me = await createUser({ weeklyPoints: 50, weeklyPointsWeekStart: LAST_WEEK });
    const board = await getLeaderboard({ scope: "national", viewerId: me.id, now: NOW });
    expect(board.viewer).toEqual({ rank: null, weeklyPoints: 0 });
  });

  it("does not expose emails", async () => {
    const user = await planter(10);
    const board = await getLeaderboard({ scope: "national", viewerId: user.id, now: NOW });
    expect(JSON.stringify(board)).not.toContain(user.email!);
  });

  it("reports the week window", async () => {
    const user = await planter(10);
    const board = await getLeaderboard({ scope: "national", viewerId: user.id, now: NOW });
    expect(board.weekStart).toEqual(THIS_WEEK);
    expect(board.resetsAt).toEqual(new Date(THIS_WEEK.getTime() + 7 * 86_400_000));
  });
});

describe("GET /api/leaderboard", () => {
  it("requires a session", async () => {
    signInAs(null);
    expect((await get()).status).toBe(401);
  });

  it("validates scope and requires a home city for local", async () => {
    signInAs(await createUser({ cityCode: null }));
    expect((await get("galaxy")).status).toBe(400);
    expect((await get("local")).status).toBe(400);
    expect((await get("national")).status).toBe(200);
  });

  it("returns the local board for the viewer's city", async () => {
    const me = await createUser();
    signInAs(me);
    const res = await get("local");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ scope: "local", entries: [], viewer: { rank: null } });
  });
});
