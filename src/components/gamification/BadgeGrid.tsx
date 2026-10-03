"use client";

import { MotionConfig, motion } from "motion/react";

export type BadgeView = {
  key: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

export default function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  return (
    <MotionConfig reducedMotion="user">
      <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {badges.map((b, i) => {
          const unlocked = !!b.unlockedAt;
          const pct = b.progress ? Math.round((b.progress.current / b.progress.target) * 100) : 0;
          return (
            <motion.li
              key={b.key}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 24 }}
              whileHover={{ y: -3 }}
              className={`relative overflow-hidden rounded-2xl border p-4 ${
                unlocked
                  ? "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70 shadow-[0_8px_24px_-14px_rgba(5,150,105,.45)]"
                  : "border-slate-200 bg-white/70"
              }`}
            >
              {unlocked && (
                <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Unlocked
                </span>
              )}
              <div className="flex items-start gap-3.5">
                <span
                  className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl ${
                    unlocked
                      ? "bg-gradient-to-br from-amber-100 to-emerald-100 ring-2 ring-amber-200"
                      : "bg-slate-100 grayscale ring-1 ring-slate-200"
                  }`}
                  aria-hidden
                >
                  <span className={unlocked ? "" : "opacity-40"}>{b.icon}</span>
                  {!unlocked && (
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-slate-500 text-[10px] text-white ring-2 ring-white">
                      🔒
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1 pr-14">
                  <p className={`font-semibold ${unlocked ? "text-slate-900" : "text-slate-600"}`}>{b.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{b.description}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-xs">
                {unlocked ? (
                  <span className="text-emerald-700">Earned {fmt(b.unlockedAt!)}</span>
                ) : b.progress ? (
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-slate-500">
                      <span>Progress</span>
                      <span>
                        {b.progress.current} / {b.progress.target}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="eq-fill h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400">Locked</span>
                )}
                {b.xpReward > 0 && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${unlocked ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                    +{b.xpReward} XP
                  </span>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </MotionConfig>
  );
}
