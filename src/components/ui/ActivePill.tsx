"use client";

import { MotionConfig, motion } from "motion/react";

/**
 * Highlight behind the selected nav item / tab. Every pill sharing an `id` is one
 * element to Motion, so selecting another item glides the highlight across instead of
 * jumping. Render it as the first child of a `relative` item whose content sits above it.
 */
export default function ActivePill({ id, className }: { id: string; className: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.span
        layoutId={id}
        aria-hidden
        className={`pointer-events-none absolute ${className}`}
        transition={{ type: "spring", bounce: 0.18, visualDuration: 0.38 }}
      />
    </MotionConfig>
  );
}
