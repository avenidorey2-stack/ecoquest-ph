import { describe, expect, it } from "vitest";
import { levelForXp, levelProgress, levelStartXp, levelTitle, XP_PER_PLANT } from "@/lib/levels";

describe("level curve", () => {
  it.each([
    [1, 0],
    [2, 100],
    [3, 300],
    [4, 600],
    [5, 1000],
    [10, 4500],
  ])("level %i starts at %i XP", (level, xp) => {
    expect(levelStartXp(level)).toBe(xp);
  });

  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [999, 4],
    [1000, 5],
    [4500, 10],
    [-50, 1],
  ])("%i XP → level %i", (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });

  it("is consistent at every threshold up to level 200", () => {
    for (let level = 1; level <= 200; level++) {
      expect(levelForXp(levelStartXp(level))).toBe(level);
      if (level > 1) expect(levelForXp(levelStartXp(level) - 1)).toBe(level - 1);
    }
  });

  it("matches the SQL backfill formula in the gamification migration", () => {
    for (let plants = 0; plants <= 3000; plants += 7) {
      const xp = plants * XP_PER_PLANT;
      const sql = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
      expect(sql, `plants=${plants}`).toBe(levelForXp(xp));
    }
  });
});

describe("levelProgress", () => {
  it("reports progress within the current level", () => {
    expect(levelProgress(450)).toEqual({
      level: 3,
      title: "Sapling",
      xp: 450,
      xpIntoLevel: 150,
      xpForLevel: 300,
      xpToNext: 150,
      pct: 50,
    });
  });

  it("starts a fresh account at level 1, 0%", () => {
    expect(levelProgress(0)).toMatchObject({ level: 1, title: "Seedling", pct: 0, xpToNext: 100 });
  });
});

describe("levelTitle", () => {
  it.each([
    [1, "Seedling"],
    [2, "Sprout"],
    [4, "Sapling"],
    [5, "Young Tree"],
    [12, "Forest Guardian"],
    [99, "Ancient Narra"],
  ])("level %i → %s", (level, title) => {
    expect(levelTitle(level)).toBe(title);
  });
});
