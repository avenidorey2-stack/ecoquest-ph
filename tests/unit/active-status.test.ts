import { describe, expect, it } from "vitest";
import { activeLabel, isActiveNow, visiblePresence } from "@/lib/active-status";

const now = Date.parse("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const MIN = 60_000;

describe("active status labels", () => {
  it("is Active Now only while online and recently checked in", () => {
    expect(activeLabel({ activeAt: ago(20_000), online: true }, now)).toBe("Active Now");
    expect(isActiveNow({ activeAt: ago(20_000), online: false }, now)).toBe(false);
    // The app closed without saying so (e.g. the phone died): no longer "now" after 2 minutes.
    expect(activeLabel({ activeAt: ago(3 * MIN), online: true }, now)).toBe("Active 3m ago");
  });

  it("counts up from when they left, starting at 1m", () => {
    expect(activeLabel({ activeAt: ago(5_000), online: false }, now)).toBe("Active 1m ago");
    expect(activeLabel({ activeAt: ago(59 * MIN), online: false }, now)).toBe("Active 59m ago");
    expect(activeLabel({ activeAt: ago(2 * 60 * MIN), online: false }, now)).toBe("Active 2h ago");
    expect(activeLabel({ activeAt: ago(3 * 24 * 60 * MIN), online: false }, now)).toBe("Active 3d ago");
    expect(activeLabel({ activeAt: ago(8 * 24 * 60 * MIN), online: false }, now)).toBeNull();
    expect(activeLabel({ activeAt: null, online: false }, now)).toBeNull();
  });

  it("is shared with friends only, and only if the planter allows it", () => {
    const person = { lastActiveAt: new Date(now), isOnline: true, showActiveStatus: true };
    expect(visiblePresence(person, true)).toEqual({ activeAt: new Date(now).toISOString(), online: true });
    expect(visiblePresence(person, false)).toEqual({ activeAt: null, online: false });
    expect(visiblePresence({ ...person, showActiveStatus: false }, true)).toEqual({ activeAt: null, online: false });
  });
});
