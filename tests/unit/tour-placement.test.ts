import { describe, expect, it } from "vitest";
import { GAP, MARGIN, placeCard, spotlightBox } from "@/lib/tour-placement";

describe("spotlightBox", () => {
  it("pads the target", () => {
    expect(spotlightBox({ x: 100, y: 100, width: 50, height: 20 }, 1000, 800, 6)).toEqual({ x: 94, y: 94, width: 62, height: 32 });
  });

  it("clips to the viewport", () => {
    expect(spotlightBox({ x: -50, y: 700, width: 200, height: 300 }, 1000, 800, 6)).toEqual({ x: 2, y: 694, width: 154, height: 104 });
  });

  it("returns null when the target is off screen", () => {
    expect(spotlightBox({ x: 10, y: 900, width: 50, height: 50 }, 1000, 800)).toBeNull();
    expect(spotlightBox({ x: 10, y: 10, width: 0, height: 0 }, 1000, 800, 0)).toBeNull();
  });
});

describe("placeCard", () => {
  it("centers the card when there is no target", () => {
    expect(placeCard(null, 300, 200, 1000, 800)).toEqual({ x: 350, y: 300, arrow: null, arrowOffset: 0 });
  });

  it("goes below the target when there is room, arrow pointing up at its center", () => {
    const p = placeCard({ x: 400, y: 100, width: 200, height: 50 }, 300, 200, 1000, 800);
    expect(p).toMatchObject({ x: 350, y: 150 + GAP, arrow: "top" });
    expect(p.arrowOffset).toBe(150); // card x 350 + 150 = target center 500
  });

  it("flips above when there is no room below", () => {
    const p = placeCard({ x: 400, y: 600, width: 200, height: 150 }, 300, 200, 1000, 800);
    expect(p).toMatchObject({ y: 600 - GAP - 200, arrow: "bottom" });
  });

  it("honours a preferred side (sidebar items go right)", () => {
    const p = placeCard({ x: 10, y: 300, width: 230, height: 40 }, 300, 200, 1400, 800, ["right", "bottom"]);
    expect(p).toMatchObject({ x: 240 + GAP, y: 220, arrow: "left", arrowOffset: 100 });
  });

  it("keeps the card inside the screen edges", () => {
    const p = placeCard({ x: 950, y: 10, width: 40, height: 40 }, 300, 200, 1000, 800);
    expect(p.x).toBe(1000 - MARGIN - 300);
    expect(p.arrowOffset).toBeLessThanOrEqual(300 - 22);
  });

  it("overlaps the bottom of the screen when the target fills it", () => {
    const p = placeCard({ x: 2, y: 2, width: 386, height: 796 }, 360, 260, 390, 800);
    expect(p).toEqual({ x: 15, y: 800 - MARGIN - 260, arrow: null, arrowOffset: 0 });
  });
});
