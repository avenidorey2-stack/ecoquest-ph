"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";

/** A number that counts up from 0 once it mounts (instantly under reduced motion). */
export default function CountUp({ to, delay = 0, duration = 1.4 }: { to: number; delay?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const value = useMotionValue(0);
  const text = useTransform(() => Math.round(value.get()).toLocaleString("en-PH"));
  useEffect(() => {
    if (reduce) {
      value.jump(to);
      return;
    }
    const controls = animate(value, to, { duration, delay, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, to, delay, duration, reduce]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}
