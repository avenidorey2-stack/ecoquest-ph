import { describe, expect, it } from "vitest";
import { currentWeeklyPoints, nextWeekStart, weekStart } from "@/lib/week";

// Monday 2026-10-05 00:00 PHT = Sunday 2026-10-04 16:00 UTC
const MONDAY_PHT = new Date("2026-10-04T16:00:00.000Z");

describe("weekStart (Monday 00:00 Asia/Manila)", () => {
  it.each([
    ["Monday 00:00 PHT exactly", "2026-10-04T16:00:00.000Z", MONDAY_PHT],
    ["Monday 08:00 PHT (00:00 UTC)", "2026-10-05T00:00:00.000Z", MONDAY_PHT],
    ["Wednesday afternoon", "2026-10-07T07:30:00.000Z", MONDAY_PHT],
    ["Sunday 23:59:59 PHT", "2026-10-11T15:59:59.999Z", MONDAY_PHT],
    ["Next Monday 00:00 PHT", "2026-10-11T16:00:00.000Z", new Date("2026-10-11T16:00:00.000Z")],
    ["Sunday 23:59 PHT the week before", "2026-10-04T15:59:00.000Z", new Date("2026-09-27T16:00:00.000Z")],
  ])("%s", (_label, now, expected) => {
    expect(weekStart(new Date(now))).toEqual(expected);
  });

  it("handles month and year boundaries", () => {
    // Thursday 2027-01-01 10:00 PHT → week began Monday 2026-12-28 PHT
    expect(weekStart(new Date("2027-01-01T02:00:00.000Z"))).toEqual(new Date("2026-12-27T16:00:00.000Z"));
  });

  it("nextWeekStart is exactly 7 days later", () => {
    expect(nextWeekStart(new Date("2026-10-07T07:30:00.000Z"))).toEqual(new Date("2026-10-11T16:00:00.000Z"));
  });
});

describe("currentWeeklyPoints", () => {
  const now = new Date("2026-10-07T07:30:00.000Z");

  it("counts points from this week", () => {
    expect(currentWeeklyPoints({ weeklyPoints: 40, weeklyPointsWeekStart: MONDAY_PHT }, now)).toBe(40);
  });

  it("treats points from an earlier week (or never) as 0", () => {
    const lastWeek = new Date("2026-09-27T16:00:00.000Z");
    expect(currentWeeklyPoints({ weeklyPoints: 40, weeklyPointsWeekStart: lastWeek }, now)).toBe(0);
    expect(currentWeeklyPoints({ weeklyPoints: 40, weeklyPointsWeekStart: null }, now)).toBe(0);
  });
});
