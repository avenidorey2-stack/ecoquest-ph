import type { PublicAchievement } from "@/lib/public-profile";
import { formatDate } from "@/lib/format";
import { MedalIcon } from "@/components/ui/icons";

/** Every achievement a planter has earned (they're permanent), each with its acquired date. */
export default function AchievementShowcase({
  achievements,
  emptyText = "No achievements yet.",
}: {
  achievements: PublicAchievement[];
  emptyText?: string;
}) {
  return (
    <section aria-labelledby="achievements-heading" className="eq-panel overflow-hidden rounded-2xl border border-line/80 bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 id="achievements-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">
          <MedalIcon className="h-4 w-4 text-amber-400" /> Achievements
        </h2>
        <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20">
          {achievements.length} earned
        </span>
      </header>

      {achievements.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-ink-3">{emptyText}</p>
      ) : (
        <ul className="eq-stagger eq-spring grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {achievements.map((a) => (
            <li key={a.key} className="flex items-start gap-3 rounded-xl bg-card-2 p-3 ring-1 ring-line">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card text-2xl shadow-sm ring-1 ring-amber-400/30" aria-hidden>
                {a.icon}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{a.name}</p>
                <p className="text-xs text-ink-3">{a.description}</p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/30">
                  Acquired on <time dateTime={a.unlockedAt}>{formatDate(a.unlockedAt)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
