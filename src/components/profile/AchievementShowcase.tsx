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
        <ul className="eq-stagger eq-spring grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {achievements.map((a) => (
            <li
              key={a.key}
              className="group flex h-full flex-col items-center rounded-2xl border border-amber-400/15 bg-gradient-to-b from-amber-400/[0.06] to-card-2 px-3 pb-3 pt-4 text-center transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-amber-400/35 hover:shadow-[0_14px_30px_-18px_rgb(251_191_36/0.45)] motion-reduce:hover:translate-y-0"
            >
              <span
                className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-amber-300/20 to-emerald-400/10 text-3xl ring-2 ring-amber-400/40 transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                aria-hidden
              >
                {a.icon}
              </span>
              <p className="mt-2.5 text-sm font-semibold leading-tight text-ink">{a.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-ink-3">{a.description}</p>
              <p className="mt-auto pt-2.5 text-[11px] font-medium text-amber-300">
                <span className="sr-only">Acquired on </span>
                <time dateTime={a.unlockedAt}>{formatDate(a.unlockedAt)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
