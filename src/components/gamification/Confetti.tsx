"use client";

import { motion } from "motion/react";

const COLORS = ["#10b981", "#34d399", "#fbbf24", "#f59e0b", "#a3e635", "#38bdf8", "#f472b6"];
const GOLDEN_ANGLE = 137.508;

/** A deterministic confetti burst (positions derive from the particle index, not Math.random). */
const PARTICLES = Array.from({ length: 44 }, (_, i) => {
  const angle = ((i * GOLDEN_ANGLE) % 360) * (Math.PI / 180);
  const distance = 120 + ((i * 53) % 140);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.8 - 40,
    rotate: (i * 97) % 360,
    color: COLORS[i % COLORS.length],
    size: 6 + (i % 4) * 2,
    round: i % 3 === 0,
    delay: (i % 6) * 0.03,
  };
});

/** Hidden for users who prefer reduced motion (CSS only, so server and client markup match). */
export default function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible motion-reduce:hidden" aria-hidden>
      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className={p.round ? "absolute rounded-full" : "absolute rounded-[2px]"}
          style={{ width: p.size, height: p.round ? p.size : p.size * 0.5, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 160], opacity: [1, 1, 0], rotate: p.rotate + 360, scale: 1 }}
          transition={{ duration: 1.9, delay: p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.45, 1] }}
        />
      ))}
    </div>
  );
}
