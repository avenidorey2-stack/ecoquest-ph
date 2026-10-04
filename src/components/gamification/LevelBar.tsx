import { levelProgress } from "@/lib/levels";

/**
 * Level badge + XP progress bar. `compact` fits the header; the default suits cards.
 * Pure markup (no hooks), so it renders on the server or inside client components.
 */
export default function LevelBar({ xp, compact = false, dark = false }: { xp: number; compact?: boolean; dark?: boolean }) {
  const p = levelProgress(xp);
  const label = `Level ${p.level} ${p.title}: ${p.xpIntoLevel.toLocaleString("en-PH")} of ${p.xpForLevel.toLocaleString("en-PH")} XP (${p.xpToNext.toLocaleString("en-PH")} to level ${p.level + 1})`;

  const bar = (
    <div
      className={`overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-emerald-400/15"} ${compact ? "h-1.5 w-24" : "h-2.5 w-full"}`}
      role="progressbar"
      aria-label="Experience toward next level"
      aria-valuenow={p.xpIntoLevel}
      aria-valuemin={0}
      aria-valuemax={p.xpForLevel}
    >
      <div
        className="eq-fill h-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-500 to-emerald-600 transition-[width] duration-1000 ease-out"
        style={{ width: `${Math.max(p.pct, 3)}%` }}
      />
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2" title={label}>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-xs font-extrabold text-amber-950 shadow-sm ring-2 ring-amber-400/30">
          {p.level}
        </span>
        <div className="leading-tight">
          <p className="text-[11px] font-semibold text-ink-2">{p.title}</p>
          {bar}
        </div>
      </div>
    );
  }

  return (
    <div title={label}>
      <div className="mb-1.5 flex items-end justify-between gap-3">
        <p className={`text-sm font-semibold ${dark ? "text-white" : "text-ink"}`}>
          <span className="mr-1.5 inline-grid h-6 min-w-6 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-1.5 text-xs font-extrabold text-amber-950">
            {p.level}
          </span>
          {p.title}
        </p>
        <p className={`text-xs ${dark ? "text-emerald-100/80" : "text-ink-3"}`}>
          {p.xpIntoLevel.toLocaleString("en-PH")} / {p.xpForLevel.toLocaleString("en-PH")} XP
        </p>
      </div>
      {bar}
      <p className={`mt-1 text-[11px] ${dark ? "text-emerald-100/70" : "text-ink-4"}`}>
        {p.xpToNext.toLocaleString("en-PH")} XP to level {p.level + 1}
      </p>
    </div>
  );
}
