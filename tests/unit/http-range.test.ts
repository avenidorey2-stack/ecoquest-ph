import { describe, expect, it } from "vitest";
import { parseRange } from "@/lib/http-range";

describe("parseRange", () => {
  it("returns null when there is no (or an unsupported) Range header", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-5", 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-9", 100)).toBeNull(); // multi-range → send the whole file
  });

  it("parses closed, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 }); // Safari's probe request
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
  });

  it("clamps ranges that run past the end of the file", () => {
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=50-10", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
    expect(parseRange("bytes=-", 100)).toBe("invalid");
  });
});
