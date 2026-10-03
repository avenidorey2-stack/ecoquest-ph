"use client";

import { useEffect, useState } from "react";

const ROOTS = [
  "M100 140 C 98 160, 86 172, 70 192",
  "M100 140 C 102 164, 114 176, 132 194",
  "M100 140 L 100 204",
  "M90 166 C 82 170, 74 170, 64 168",
  "M110 168 C 120 172, 128 172, 138 170",
];
const BRANCHES = ["M100 100 C 90 92, 80 88, 68 80", "M100 92 C 110 84, 120 80, 132 74"];
const CANOPY = [
  { cx: 100, cy: 58, r: 38, fill: "#16a34a", delay: 1.6 },
  { cx: 66, cy: 76, r: 26, fill: "#22c55e", delay: 1.75 },
  { cx: 134, cy: 76, r: 26, fill: "#22c55e", delay: 1.85 },
  { cx: 100, cy: 30, r: 24, fill: "#4ade80", delay: 1.95 },
];
const SPARKLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  return { dx: Math.cos(angle) * 80, dy: Math.sin(angle) * 70, delay: 2.1 + (i % 3) * 0.08 };
});

function useCountUp(target: number, startDelayMs: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, startDelayMs);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [target, startDelayMs, durationMs]);
  return value;
}

export default function GrowingTreeCelebration({
  points,
  plantCount,
  plantType,
  onContinue,
}: {
  points: number;
  plantCount: number;
  plantType: string;
  onContinue: () => void;
}) {
  const shownPoints = useCountUp(points, 2100);

  return (
    <div
      className="eq-celebration fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Quest verified"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center text-slate-900 shadow-2xl">
        <svg viewBox="0 0 200 220" className="mx-auto h-64 w-64" aria-hidden>
          {/* soil */}
          <rect x="0" y="140" width="200" height="80" rx="8" fill="#a16207" opacity="0.15" />
          <line x1="20" y1="140" x2="180" y2="140" stroke="#854d0e" strokeWidth="3" strokeLinecap="round" />

          {/* seed */}
          <ellipse className="eq-pop" cx="100" cy="140" rx="7" ry="5" fill="#854d0e" />

          {/* roots */}
          {ROOTS.map((d, i) => (
            <path
              key={d}
              d={d}
              pathLength={1}
              className="eq-draw"
              style={{ animationDelay: `${0.2 + i * 0.12}s` }}
              fill="none"
              stroke="#92400e"
              strokeWidth={i < 3 ? 3 : 2}
              strokeLinecap="round"
            />
          ))}

          <g className="eq-sway">
            {/* trunk */}
            <rect
              className="eq-grow-y"
              style={{ animationDelay: "0.9s" }}
              x="94"
              y="70"
              width="12"
              height="70"
              rx="4"
              fill="#78350f"
            />
            {/* branches */}
            {BRANCHES.map((d, i) => (
              <path
                key={d}
                d={d}
                pathLength={1}
                className="eq-draw"
                style={{ animationDelay: `${1.3 + i * 0.1}s` }}
                fill="none"
                stroke="#78350f"
                strokeWidth="4"
                strokeLinecap="round"
              />
            ))}
            {/* canopy */}
            {CANOPY.map((c) => (
              <circle
                key={`${c.cx}-${c.cy}`}
                className="eq-pop"
                style={{ animationDelay: `${c.delay}s` }}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                fill={c.fill}
              />
            ))}
          </g>

          {/* sparkles */}
          {SPARKLES.map((s, i) => (
            <circle
              key={i}
              className="eq-sparkle"
              style={
                {
                  animationDelay: `${s.delay}s`,
                  "--dx": `${s.dx}px`,
                  "--dy": `${s.dy}px`,
                } as React.CSSProperties
              }
              cx="100"
              cy="60"
              r="3.5"
              fill={i % 2 ? "#facc15" : "#86efac"}
            />
          ))}
        </svg>

        <div className="eq-fade-up" style={{ animationDelay: "2.1s" }}>
          <p className="text-4xl font-extrabold text-emerald-700">+{shownPoints} pts</p>
          <p className="mt-2 text-slate-600">
            {plantCount} {plantType} {plantCount === 1 ? "plant" : "plants"} verified. Salamat sa pagtatanim!
          </p>
          <button
            onClick={onContinue}
            autoFocus
            className="mt-5 w-full rounded-lg bg-emerald-700 py-2.5 font-semibold text-white hover:bg-emerald-800"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
