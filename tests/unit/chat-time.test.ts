import { describe, expect, it } from "vitest";
import { sentLabel } from "@/lib/chat-time";

// Wednesday, Oct 7, 2026, 2:30 PM in Manila (UTC+8).
const NOW = Date.parse("2026-10-07T06:30:00Z");
const at = (iso: string) => new Date(iso).toISOString();

describe("sentLabel", () => {
  it("today: just the time", () => {
    expect(sentLabel(at("2026-10-06T16:47:00Z"), "short", NOW)).toBe("12:47 AM"); // Oct 7, 12:47 AM Manila
    expect(sentLabel(at("2026-10-06T16:47:00Z"), "long", NOW)).toBe("12:47 AM");
  });

  it("this week: weekday and time, like Messenger", () => {
    expect(sentLabel(at("2026-10-06T14:46:00Z"), "short", NOW)).toBe("Tue 10:46 PM");
    expect(sentLabel(at("2026-10-06T13:50:00Z"), "long", NOW)).toBe("Tuesday 9:50 PM");
  });

  it("never names today's weekday for last week", () => {
    // Wed, Sep 30 at 3 PM: less than 7 x 24 hours ago, but a week back on the calendar.
    expect(sentLabel(at("2026-09-30T07:00:00Z"), "short", NOW)).toBe("Sep 30, 3:00 PM");
  });

  it("older: the date (year when it isn't this year, and always in the long form)", () => {
    expect(sentLabel(at("2026-08-01T02:00:00Z"), "short", NOW)).toBe("Aug 1, 10:00 AM");
    expect(sentLabel(at("2026-08-01T02:00:00Z"), "long", NOW)).toBe("August 1, 2026, 10:00 AM");
    expect(sentLabel(at("2025-12-31T02:00:00Z"), "short", NOW)).toBe("Dec 31, 2025, 10:00 AM");
  });
});
