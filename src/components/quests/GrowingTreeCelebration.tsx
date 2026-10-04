"use client";

import { MotionConfig, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import Confetti from "@/components/gamification/Confetti";
import { CoinIcon } from "@/components/ui/icons";

// AI-generated growth stages (scripts/generate-ai-images.mjs, keys grow:1 … grow:5).
const STAGES = [
  { src: "/images/grow/stage-1.jpg", label: "Seed" },
  { src: "/images/grow/stage-2.jpg", label: "Sprout" },
  { src: "/images/grow/stage-3.jpg", label: "Sapling" },
  { src: "/images/grow/stage-4.jpg", label: "Young tree" },
  { src: "/images/grow/stage-5.jpg", label: "Grown!" },
];
const START_MS = 350;
const STAGE_MS = 750;

const SPARKLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  return { x: Math.cos(angle) * 125, y: Math.sin(angle) * 110, delay: (i % 3) * 0.06 };
});

const fmt = (n: number) => Math.round(n).toLocaleString("en-PH");

/** A number that rolls from its previous value to `to` whenever `to` changes. */
function Ticker({ from, to, instant }: { from: number; to: number; instant: boolean }) {
  const value = useMotionValue(instant ? to : from);
  const text = useTransform(value, fmt);
  useEffect(() => {
    const controls = animate(value, to, { duration: instant ? 0 : 0.6, ease: "easeOut" });
    return () => controls.stop();
  }, [value, to, instant]);
  return <motion.span>{text}</motion.span>;
}

/** Points earned once `stage` of the five stages has grown (the last stage lands on the exact total). */
const earnedAt = (points: number, stage: number) => Math.round((points * stage) / STAGES.length);

export default function GrowingTreeCelebration({
  points,
  balanceAfter,
  plantCount,
  plantType,
  onContinue,
}: {
  points: number;
  /** The planter's balance including these points. */
  balanceAfter: number;
  plantCount: number;
  plantType: string;
  onContinue: () => void;
}) {
  const reduced = !!useReducedMotion();
  // 0 = nothing shown yet; 1–5 = growth stage on screen. Reduced motion jumps to the grown tree.
  const [grown, setStage] = useState(0);
  const stage = reduced ? STAGES.length : grown;
  const done = stage === STAGES.length;

  useEffect(() => {
    if (reduced) return;
    const timers = STAGES.map((_, i) => setTimeout(() => setStage(i + 1), START_MS + i * STAGE_MS));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  const earned = earnedAt(points, stage);
  const gain = stage > 0 ? earned - earnedAt(points, stage - 1) : 0;
  // Points spent before this celebration played can make "before" negative; skip the line then.
  const balanceBefore = balanceAfter - points;

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="fixed inset-0 z-[2000] m-0 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Quest verified: plus ${points} points`}
        onKeyDown={(e) => e.key === "Escape" && onContinue()}
      >
        <motion.div
          className="relative w-full max-w-sm rounded-3xl border border-emerald-400/15 bg-card p-6 text-center text-ink shadow-2xl"
          initial={{ scale: 0.9, y: 24, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        >
          {done && <Confetti />}
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Quest verified</p>

          {/* The tree: AI-painted stages cross-fade and swell as it grows. */}
          <div className="relative mx-auto mt-3 h-60 w-60 sm:h-64 sm:w-64" aria-hidden>
            <motion.div
              className="absolute inset-4 rounded-full bg-emerald-400/25 blur-2xl"
              animate={{ opacity: 0.25 + stage * 0.15, scale: 0.6 + stage * 0.1 }}
              transition={{ duration: 0.6 }}
            />
            <div className="eq-grow-stage absolute inset-0">
              {STAGES.map((s, i) => {
                const active = i === stage - 1;
                return (
                  <motion.img
                    key={s.src}
                    src={s.src}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ transformOrigin: "50% 80%" }}
                    initial={false}
                    animate={{ opacity: active ? 1 : 0, scale: active ? 1 : i < stage - 1 ? 1.06 : 0.82, y: active ? 0 : 10 }}
                    transition={{ type: "spring", stiffness: 180, damping: 18, opacity: { duration: 0.45 } }}
                  />
                );
              })}
            </div>

            {/* A "+N" chip floats up off the tree as each stage lands (each replaces the last). */}
            {gain > 0 && !reduced && (
              <motion.span
                key={stage}
                className="absolute left-1/2 top-1/3 -ml-7 w-14 rounded-full bg-amber-400 py-0.5 text-sm font-extrabold text-amber-950 shadow-lg"
                initial={{ opacity: 0, y: 12, scale: 0.6 }}
                animate={{ opacity: [0, 1, 1, 0], y: -64, scale: 1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              >
                +{fmt(gain)}
              </motion.span>
            )}

            {done && !reduced &&
              SPARKLES.map((s, i) => (
                <motion.span
                  key={i}
                  className={`absolute left-1/2 top-1/2 h-2 w-2 rounded-full ${i % 2 ? "bg-amber-300" : "bg-lime-300"}`}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                  animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: 1 }}
                  transition={{ duration: 1.2, delay: s.delay, ease: "easeOut" }}
                />
              ))}
          </div>

          {/* Growth progress: seed → grown. */}
          <ol className="mx-auto mt-1 flex max-w-[15rem] gap-1.5" aria-hidden>
            {STAGES.map((s, i) => (
              <li key={s.label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-3">
                <motion.span
                  className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400"
                  initial={false}
                  animate={{ scaleX: i < stage ? 1 : 0 }}
                  style={{ originX: 0 }}
                  transition={{ duration: 0.4 }}
                />
              </li>
            ))}
          </ol>
          <p className="mt-1.5 h-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3" aria-hidden>
            {stage > 0 ? STAGES[stage - 1].label : " "}
          </p>

          <motion.p
            className="mt-3 flex items-center justify-center gap-2 text-4xl font-extrabold tabular-nums text-amber-300"
            animate={done && !reduced ? { scale: [1, 1.12, 1] } : undefined}
            transition={{ duration: 0.5 }}
            aria-hidden
          >
            <CoinIcon className="h-8 w-8 shrink-0" />
            <span>
              +<Ticker from={0} to={earned} instant={reduced} />
            </span>
            <span className="text-lg font-bold text-amber-200/80">pts</span>
          </motion.p>
          {balanceBefore >= 0 && (
            <p className="mt-1 text-sm text-ink-3" aria-hidden>
              Balance {fmt(balanceBefore)} →{" "}
              <strong className="tabular-nums text-ink">
                <Ticker from={balanceBefore} to={balanceBefore + earned} instant={reduced} />
              </strong>{" "}
              pts
            </p>
          )}
          <p className="sr-only">
            You earned {points} points. Your balance is now {balanceAfter} points.
          </p>

          <p className="mt-3 text-ink-2">
            {plantCount} {plantType} {plantCount === 1 ? "plant" : "plants"} verified. Salamat sa pagtatanim!
          </p>
          <button
            onClick={onContinue}
            autoFocus
            className="relative mt-5 w-full rounded-xl bg-emerald-400 py-2.5 font-semibold text-emerald-950 hover:bg-emerald-300"
          >
            {done ? "Continue" : "Skip"}
          </button>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
