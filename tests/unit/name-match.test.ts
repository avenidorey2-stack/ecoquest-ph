import { describe, expect, it } from "vitest";
import { nameMatchRank } from "@/lib/friends";

describe("nameMatchRank", () => {
  it("ranks whole name, then start, then a later word, then inside a word — ignoring case", () => {
    expect(nameMatchRank("GAB", "gab")).toBe(0);
    expect(nameMatchRank("Gabriel Reyes", "gab")).toBe(1);
    expect(nameMatchRank("Ma. Gabby Santos", "GAB")).toBe(2);
    expect(nameMatchRank("Ana Gab-Cruz", "cruz")).toBe(2);
    expect(nameMatchRank("Ligaba Cruz", "gab")).toBe(3);
  });

  it("ignores spaces around the query", () => {
    expect(nameMatchRank("Gab", "  gab ")).toBe(0);
  });
});
