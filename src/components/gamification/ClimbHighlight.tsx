"use client";

import { MotionConfig, motion } from "framer-motion";

/**
 * Leaderboard highlight for the viewer's row after a climb: a glowing pulse around the row
 * and a "▲ up N" chip. Place inside a `relative` row.
 */
export default function ClimbHighlight({ from, to }: { from: number; to: number }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-amber-400 motion-reduce:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.2, 1, 0], backgroundColor: ["rgba(251,191,36,0)", "rgba(251,191,36,.18)", "rgba(251,191,36,0)"] }}
        transition={{ duration: 2.4, ease: "easeInOut" }}
      />
      <motion.span
        className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800"
        initial={{ scale: 0, y: 6 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.3 }}
        title={`Up from #${from}`}
      >
        ▲ {from - to}
      </motion.span>
    </MotionConfig>
  );
}
