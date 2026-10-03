import type { CSSProperties } from "react";

// Falling leaves for the decorative backdrops (see globals.css "Eco background"). Each leaf
// falls with drift + spin on its wrapper and sways on the svg; `flip` adds a slow turn-over.
// Motion stops under prefers-reduced-motion.

export type Leaf = {
  x: string;
  /** Size in px. */
  s: number;
  /** Fall duration and (negative) start offset, in seconds. */
  d: number;
  delay: number;
  drift: number;
  spin: number;
  c: string;
  shape?: 0 | 1 | 2;
  /** Turn-over period in seconds; omitted = no turn-over. */
  flip?: number;
};

const SHAPES = [
  // Classic tilted leaf.
  { body: "M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Z", vein: "M4 20 14.5 9.5" },
  // Long, narrow leaf (bamboo / willow).
  { body: "M12 1.5C7.5 6.5 7.5 17 12 22.5c4.5-5.5 4.5-16 0-21Z", vein: "M12 4v17" },
  // Broad, rounded leaf.
  { body: "M12 2.5c5.5 3 8 8.5 5.6 13.6C16 19.5 13.4 21.5 12 21.5s-4-2-5.6-5.4C4 11 6.5 5.5 12 2.5Z", vein: "M12 5v15" },
];

/** Deterministic PRNG, so the server and client render the same leaves. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` leaves spread evenly across the width (with jitter), already mid-fall on load. */
export function makeLeaves(
  count: number,
  seed: number,
  palette: string[],
  { size = [16, 30], duration = [16, 30] }: { size?: [number, number]; duration?: [number, number] } = {},
): Leaf[] {
  const r = rng(seed);
  const between = ([a, b]: [number, number]) => a + r() * (b - a);
  const leaves = Array.from({ length: count }, (_, i): Leaf => {
    const d = between(duration);
    const side = r() < 0.5 ? -1 : 1;
    return {
      x: `${(((i + 0.1 + r() * 0.8) / count) * 100).toFixed(1)}%`,
      s: Math.round(between(size)),
      d: Math.round(d * 10) / 10,
      delay: -Math.round(r() * d * 10) / 10,
      drift: side * Math.round(40 + r() * 110),
      spin: (r() < 0.5 ? -1 : 1) * Math.round(200 + r() * 260),
      c: palette[i % palette.length],
      shape: (i % 3) as 0 | 1 | 2,
      flip: r() < 0.45 ? Math.round((2.5 + r() * 3) * 10) / 10 : undefined,
    };
  });
  // Shuffle so the first N (all that phones show) are spread across the width, not bunched left.
  for (let i = leaves.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [leaves[i], leaves[j]] = [leaves[j], leaves[i]];
  }
  return leaves;
}

export default function FallingLeaves({ leaves, className = "" }: { leaves: Leaf[]; className?: string }) {
  return (
    <div className={`eq-leaves ${className}`} aria-hidden>
      {leaves.map((l, i) => {
        const shape = SHAPES[l.shape ?? 0];
        return (
          <span
            key={i}
            className="eq-eco-leaf"
            style={
              {
                "--x": l.x,
                "--s": `${l.s}px`,
                "--d": `${l.d}s`,
                "--delay": `${l.delay}s`,
                "--drift": `${l.drift}px`,
                "--spin": `${l.spin}deg`,
                "--c": l.c,
                ...(l.flip ? { "--flip": `${l.flip}s` } : null),
              } as CSSProperties
            }
          >
            <svg viewBox="0 0 24 24">
              <g className={l.flip ? "eq-leaf-flip" : undefined}>
                <path fill="currentColor" d={shape.body} />
                <path d={shape.vein} stroke="white" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" fill="none" />
              </g>
            </svg>
          </span>
        );
      })}
    </div>
  );
}
