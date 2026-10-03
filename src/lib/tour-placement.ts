// Geometry for the guided tour: where the spotlight sits and where its card goes.
// Pure functions (no DOM) so they can be unit-tested.

export type Box = { x: number; y: number; width: number; height: number };
export type Side = "top" | "bottom" | "left" | "right";
export type Placement = {
  x: number;
  y: number;
  /** Side of the card that faces the target; null when the card floats (centered / overlapping). */
  arrow: Side | null;
  /** Arrow offset along that side, in px from the card's left (top/bottom) or top (left/right) edge. */
  arrowOffset: number;
};

/** Space between the card and the spotlight, and between the card and the screen edge. */
export const GAP = 14;
export const MARGIN = 12;
/** Spotlight padding around the target. */
export const PAD = 6;
const ARROW_INSET = 22;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/** Padded target rect, clipped to the viewport; null when the target is entirely off screen. */
export function spotlightBox(target: Box, vw: number, vh: number, pad = PAD): Box | null {
  const left = Math.max(target.x - pad, 2);
  const top = Math.max(target.y - pad, 2);
  const right = Math.min(target.x + target.width + pad, vw - 2);
  const bottom = Math.min(target.y + target.height + pad, vh - 2);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Where to put a `w`×`h` card next to `spot` inside a `vw`×`vh` viewport. Tries each side in
 * `order`; when none fits (e.g. a card taller than the screen on a phone) it overlaps the bottom
 * of the screen. With no spot, the card is centered.
 */
export function placeCard(
  spot: Box | null,
  w: number,
  h: number,
  vw: number,
  vh: number,
  order: Side[] = ["bottom", "top", "right", "left"],
): Placement {
  const maxX = vw - MARGIN - w;
  const maxY = vh - MARGIN - h;
  if (!spot) return { x: clamp((vw - w) / 2, MARGIN, maxX), y: clamp((vh - h) / 2, MARGIN, maxY), arrow: null, arrowOffset: 0 };

  const cx = spot.x + spot.width / 2;
  const cy = spot.y + spot.height / 2;
  const alongX = (x: number) => clamp(cx - x, ARROW_INSET, w - ARROW_INSET);
  const alongY = (y: number) => clamp(cy - y, ARROW_INSET, h - ARROW_INSET);

  for (const side of order) {
    if (side === "bottom" && spot.y + spot.height + GAP + h <= vh - MARGIN) {
      const x = clamp(cx - w / 2, MARGIN, maxX);
      return { x, y: spot.y + spot.height + GAP, arrow: "top", arrowOffset: alongX(x) };
    }
    if (side === "top" && spot.y - GAP - h >= MARGIN) {
      const x = clamp(cx - w / 2, MARGIN, maxX);
      return { x, y: spot.y - GAP - h, arrow: "bottom", arrowOffset: alongX(x) };
    }
    if (side === "right" && spot.x + spot.width + GAP + w <= vw - MARGIN) {
      const y = clamp(cy - h / 2, MARGIN, maxY);
      return { x: spot.x + spot.width + GAP, y, arrow: "left", arrowOffset: alongY(y) };
    }
    if (side === "left" && spot.x - GAP - w >= MARGIN) {
      const y = clamp(cy - h / 2, MARGIN, maxY);
      return { x: spot.x - GAP - w, y, arrow: "right", arrowOffset: alongY(y) };
    }
  }
  return { x: clamp((vw - w) / 2, MARGIN, maxX), y: clamp(maxY, MARGIN, maxY), arrow: null, arrowOffset: 0 };
}
