"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type AnchorRect = { top: number; left: number; right: number; bottom: number; width: number; height: number };
export type Side = "above" | "below" | "left" | "right";

const GAP = 6;
/** Never closer than this to the window's edges. */
const EDGE = 8;

/** A plain copy of an element's box (DOMRect can't be kept in state reliably). */
export function rectOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

/**
 * Floats `children` over the page (portal, `position: fixed`) beside `anchor`: the first side in
 * `sides` where it fits, centered on the anchor, and always kept fully inside the window, so it's
 * never cut off by a small chat window or the screen edge. Re-places itself when its size changes.
 */
export default function Floating({
  anchor,
  sides,
  className,
  children,
  ...rest
}: {
  anchor: AnchorRect;
  sides: Side[];
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  const box = useRef<HTMLDivElement>(null);
  const sidesKey = sides.join(",");

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const fits: Record<Side, boolean> = {
        above: anchor.top - GAP - h >= EDGE,
        below: anchor.bottom + GAP + h <= H - EDGE,
        left: anchor.left - GAP - w >= EDGE,
        right: anchor.right + GAP + w <= W - EDGE,
      };
      const order = sidesKey.split(",") as Side[];
      const side = order.find((s) => fits[s]) ?? order[0];
      let top = anchor.top + anchor.height / 2 - h / 2;
      let left = anchor.left + anchor.width / 2 - w / 2;
      if (side === "above") top = anchor.top - GAP - h;
      if (side === "below") top = anchor.bottom + GAP;
      if (side === "left") left = anchor.left - GAP - w;
      if (side === "right") left = anchor.right + GAP;
      el.style.top = `${Math.round(Math.min(Math.max(top, EDGE), H - h - EDGE))}px`;
      el.style.left = `${Math.round(Math.min(Math.max(left, EDGE), W - w - EDGE))}px`;
      el.style.visibility = "visible";
      el.dataset.side = side;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor.top, anchor.left, anchor.right, anchor.bottom, anchor.width, anchor.height, sidesKey]);

  return createPortal(
    <div ref={box} {...rest} className={`fixed z-[2100] ${className ?? ""}`} style={{ top: 0, left: 0, visibility: "hidden" }}>
      {children}
    </div>,
    document.body,
  );
}
