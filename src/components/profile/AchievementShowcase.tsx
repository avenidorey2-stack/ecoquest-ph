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
    <section aria-labelledby="achievements-heading" className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 id="achievements-heading" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <MedalIcon className="h-4 w-4 text-amber-600" /> Achievements
        </h2>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
          {achievements.length} earned
        </span>
      </header>

      {achievements.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <ul className="eq-stagger eq-spring grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {achievements.map((a) => (
            <li key={a.key} className="flex items-start gap-3 rounded-xl bg-cream-50 p-3 ring-1 ring-slate-100">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-amber-100" aria-hidden>
                {a.icon}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{a.name}</p>
                <p className="text-xs text-slate-500">{a.description}</p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
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
