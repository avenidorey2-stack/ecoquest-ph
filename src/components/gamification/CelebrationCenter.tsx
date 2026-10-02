"use client";

import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useTransform } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PendingCelebrations } from "@/lib/celebrations";
import Confetti from "./Confetti";

function acknowledge(kind: "level" | "achievements" | "rank") {
  return fetch("/api/celebrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  }).catch(() => {});
}

function CountUp({ from, to }: { from: number; to: number }) {
  const value = useMotionValue(from);
  const rounded = useTransform(value, (v) => Math.round(v));
  useEffect(() => {
    const controls = animate(value, to, { duration: 1.1, delay: 0.35, ease: "easeOut" });
    return () => controls.stop();
  }, [value, to]);
  return <motion.span>{rounded}</motion.span>;
}

function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-[2100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <motion.div
        className="relative w-full max-w-sm overflow-visible rounded-3xl bg-white p-7 text-center text-slate-900 shadow-2xl"
        initial={{ scale: 0.6, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function LevelUp({ data, onClose }: { data: NonNullable<PendingCelebrations["levelUp"]>; onClose: () => void }) {
  return (
    <Modal onClose={onClose} label={`Level up to ${data.to}`}>
      <Confetti />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Level up!</p>
      <motion.div
        className="mx-auto mt-4 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-5xl font-black text-amber-950 shadow-[0_10px_40px_-10px_rgba(245,158,11,.7)] ring-8 ring-amber-100"
        animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 0.9, delay: 0.4 }}
      >
        <CountUp from={data.from} to={data.to} />
      </motion.div>
      <h2 className="mt-5 text-2xl font-bold">You&apos;re now a {data.title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Level {data.from} → {data.to}. Every verified tree brings you closer to the next one.
      </p>
      <button
        onClick={onClose}
        autoFocus
        className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700"
      >
        Keep planting
      </button>
    </Modal>
  );
}

function Badges({ items, onClose }: { items: PendingCelebrations["achievements"]; onClose: () => void }) {
  const totalXp = items.reduce((sum, a) => sum + a.xpReward, 0);
  return (
    <Modal onClose={onClose} label="Achievements unlocked">
      <Confetti />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
        {items.length === 1 ? "Achievement unlocked" : `${items.length} achievements unlocked`}
      </p>
      <ul className="mt-5 space-y-2.5">
        {items.slice(0, 5).map((a, i) => (
          <motion.li
            key={a.key}
            className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-cream-50 p-3 text-left"
            initial={{ opacity: 0, x: -24, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: 0.25 + i * 0.12, type: "spring", stiffness: 300, damping: 20 }}
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-emerald-100">
              {a.icon}
            </span>
            <span className="min-w-0 flex-1 font-semibold">{a.name}</span>
            {a.xpReward > 0 && <span className="text-xs font-bold text-amber-600">+{a.xpReward} XP</span>}
          </motion.li>
        ))}
      </ul>
      {items.length > 5 && <p className="mt-2 text-xs text-slate-500">…and {items.length - 5} more</p>}
      {totalXp > 0 && <p className="mt-4 text-sm text-slate-600">+{totalXp} XP added to your level bar</p>}
      <div className="mt-6 flex gap-2">
        <Link
          href="/achievements"
          onClick={onClose}
          className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          View all
        </Link>
        <button
          onClick={onClose}
          autoFocus
          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Awesome!
        </button>
      </div>
    </Modal>
  );
}

function RankToast({ data, onClose }: { data: NonNullable<PendingCelebrations["rankUp"]>; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 9000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const climbed = data.from - data.to;
  return (
    <motion.div
      role="status"
      className="fixed right-4 top-20 z-[2050] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xl"
      initial={{ x: 420, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 420, opacity: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
    >
      <div className="flex items-start gap-3 p-4">
        <motion.span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-lg font-black text-emerald-700"
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: 2, duration: 0.6 }}
          aria-hidden
        >
          ▲
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            Up {climbed} {climbed === 1 ? "place" : "places"} — now #{data.to}!
          </p>
          <p className="text-sm text-slate-600">
            {data.passed ? (
              <>
                You overtook <strong>{data.passed}</strong> in {data.place} this week.
              </>
            ) : (
              <>You climbed from #{data.from} in {data.place} this week.</>
            )}
          </p>
          <Link href={`/leaderboard?scope=${data.scope}`} onClick={onClose} className="mt-1 inline-block text-xs font-semibold text-emerald-700">
            See leaderboard →
          </Link>
        </div>
        <button onClick={onClose} aria-label="Dismiss" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
          ✕
        </button>
      </div>
      <motion.div
        className="h-1 bg-gradient-to-r from-emerald-400 to-lime-400"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        style={{ originX: 0 }}
        transition={{ duration: 9, ease: "linear" }}
      />
    </motion.div>
  );
}

/**
 * Plays pending celebrations once each: level-up, then new badges (modals, in turn),
 * with a leaderboard-climb toast alongside. Each is acknowledged when dismissed.
 */
export default function CelebrationCenter({ pending }: { pending: PendingCelebrations }) {
  const router = useRouter();
  const [showLevel, setShowLevel] = useState(!!pending.levelUp);
  const [showBadges, setShowBadges] = useState(pending.achievements.length > 0);
  const [showRank, setShowRank] = useState(!!pending.rankUp);

  // Stable callbacks: the rank toast's auto-dismiss timer must not restart on re-render.
  const closeLevel = useCallback(() => {
    setShowLevel(false);
    acknowledge("level").then(() => router.refresh());
  }, [router]);
  const closeBadges = useCallback(() => {
    setShowBadges(false);
    acknowledge("achievements").then(() => router.refresh());
  }, [router]);
  const closeRank = useCallback(() => {
    setShowRank(false);
    acknowledge("rank");
  }, []);

  // reducedMotion="user": movement is skipped for people who ask their OS for less motion.
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {showLevel && pending.levelUp ? (
          <LevelUp key="level" data={pending.levelUp} onClose={closeLevel} />
        ) : showBadges ? (
          <Badges key="badges" items={pending.achievements} onClose={closeBadges} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {showRank && pending.rankUp && <RankToast key="rank" data={pending.rankUp} onClose={closeRank} />}
      </AnimatePresence>
    </MotionConfig>
  );
}
