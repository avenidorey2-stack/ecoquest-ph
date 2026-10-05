import type { CSSProperties } from "react";

// Bioluminescent fireflies & forest spore motes for the live animated backdrop.
// Upward drift + breathing pulse + organic sway. Deterministic PRNG ensures
// zero React hydration mismatches between SSR and client.
// Automatically disabled under prefers-reduced-motion.

export type Firefly = {
  x: string;
  s: number;
  d: number;
  delay: number;
  /** Sway width in px; 45+ uses the wide sway. */
  drift: number;
  c: string;
};

const PALETTE = [
  "rgb(52 211 153 / 0.85)",   // emerald
  "rgb(163 230 53 / 0.8)",    // lime
  "rgb(110 231 183 / 0.9)",   // mint glow
  "rgb(250 204 21 / 0.75)",   // golden amber
  "rgb(74 222 128 / 0.85)",   // spring green
];

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeFireflies(count = 20, seed = 42): Firefly[] {
  const r = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    const d = 16 + r() * 18; // 16s to 34s drift
    return {
      x: `${(((i + 0.2 + r() * 0.7) / count) * 100).toFixed(1)}%`,
      s: Math.round(4 + r() * 5), // 4px to 9px
      d: Math.round(d * 10) / 10,
      delay: -Math.round(r() * d * 10) / 10, // pre-warmed so they're already mid-air
      drift: Math.round(20 + r() * 45),
      c: PALETTE[i % PALETTE.length],
    };
  });
}

const DEFAULT_FIREFLIES = makeFireflies(18, 99);

export default function Fireflies({ fireflies = DEFAULT_FIREFLIES }: { fireflies?: Firefly[] }) {
  return (
    <div className="eq-fireflies" aria-hidden>
      {fireflies.map((f, i) => (
        <span
          key={i}
          className={f.drift >= 45 ? "eq-firefly eq-firefly--wide" : "eq-firefly"}
          style={
            {
              "--x": f.x,
              "--s": `${f.s}px`,
              "--d": `${f.d}s`,
              "--delay": `${f.delay}s`,
              "--c": f.c,
            } as CSSProperties
          }
        >
          <span />
        </span>
      ))}
    </div>
  );
}
