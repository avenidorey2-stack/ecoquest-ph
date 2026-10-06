"use client";

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
    <ul className="eq-stagger eq-spring grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {badges.map((b) => {
        const unlocked = !!b.unlockedAt;
        const pct = b.progress ? Math.round((b.progress.current / b.progress.target) * 100) : 0;
        return (
          // Hover is plain CSS (the `translate` property), so it never fights the .eq-stagger entrance
          // animation on `transform` — every card lifts the same way.
          <li
            key={b.key}
            className={`group relative overflow-hidden rounded-2xl border p-4 transition-[translate,border-color,box-shadow,background-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-1 motion-reduce:hover:translate-y-0 ${
              unlocked
                ? "border-emerald-400/20 bg-gradient-to-br from-card to-emerald-400/[0.07] shadow-[0_8px_24px_-14px_rgba(5,150,105,.45)] hover:border-emerald-400/45 hover:shadow-[0_18px_36px_-16px_rgba(16,185,129,.55)]"
                : "border-line bg-card/70 hover:border-emerald-400/30 hover:bg-card hover:shadow-[0_16px_32px_-18px_rgba(16,185,129,.4)]"
            }`}
          >
            {unlocked && (
              <span className="absolute right-3 top-3 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950">
                Unlocked
              </span>
            )}
            <div className="flex items-start gap-3.5">
              <span
                className={`relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100 ${
                  unlocked
                    ? "bg-gradient-to-br from-amber-400/10 to-emerald-400/10 ring-2 ring-amber-400/30"
                    : "bg-card-2 grayscale ring-1 ring-line"
                }`}
                aria-hidden
              >
                <span className={unlocked ? "" : "opacity-40"}>{b.icon}</span>
                {!unlocked && (
                  <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-line-strong text-[10px] text-white ring-2 ring-card">
                    🔒
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1 pr-14">
                <p className={`font-semibold ${unlocked ? "text-ink" : "text-ink-2"}`}>{b.name}</p>
                <p className="mt-0.5 text-xs text-ink-3">{b.description}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              {unlocked ? (
                <span className="text-emerald-400">Earned {fmt(b.unlockedAt!)}</span>
              ) : b.progress ? (
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-ink-3">
                    <span>Progress</span>
                    <span>
                      {b.progress.current} / {b.progress.target}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-card-2">
                    <div className="eq-fill h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ) : (
                <span className="text-ink-4">Locked</span>
              )}
              {b.xpReward > 0 && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${unlocked ? "bg-amber-400/15 text-amber-300" : "bg-card-2 text-ink-3"}`}>
                  +{b.xpReward} XP
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
