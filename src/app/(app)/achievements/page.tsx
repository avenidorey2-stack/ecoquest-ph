import Link from "next/link";
import { requirePageUserId } from "@/lib/authz";
import { getAchievementBoard } from "@/lib/achievements";
import { prisma } from "@/lib/prisma";
import LevelBar from "@/components/gamification/LevelBar";
import BadgeGrid from "@/components/gamification/BadgeGrid";

const CATEGORY_ORDER = ["Planting", "Biodiversity", "Leaderboard", "Community", "Growth"] as const;
const CATEGORY_BLURB: Record<(typeof CATEGORY_ORDER)[number], string> = {
  Planting: "Milestones for verified trees.",
  Biodiversity: "Plant a healthy mix of native species.",
  Leaderboard: "Weekly rankings — earned the moment you reach them.",
  Community: "Bring friends into the movement.",
  Growth: "Level up by planting and earning badges.",
};

export default async function AchievementsPage() {
  const userId = await requirePageUserId();
  const [{ badges }, user] = await Promise.all([
    getAchievementBoard(userId),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } }),
  ]);

  const unlocked = badges.filter((b) => b.unlockedAt).length;
  const nextUp = badges
    .filter((b) => !b.unlockedAt && b.progress && b.progress.current > 0)
    .sort((a, b) => b.progress!.current / b.progress!.target - a.progress!.current / a.progress!.target)[0];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-5 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:grid-cols-[auto_1fr_1fr] md:items-center">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-950 text-center text-white">
            <div>
              <p className="text-2xl font-black leading-none">{unlocked}</p>
              <p className="text-[10px] uppercase tracking-wider text-emerald-200">of {badges.length}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Badges unlocked</p>
            <p className="text-lg font-bold text-slate-900">
              {unlocked === badges.length ? "All badges collected! 🎉" : `${badges.length - unlocked} still to earn`}
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-cream-50 p-4">
          <LevelBar xp={user.xp} />
        </div>
        <div className="rounded-xl border border-dashed border-emerald-200 p-4 text-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Closest next badge</p>
          {nextUp ? (
            <p className="mt-1 text-slate-800">
              <span className="mr-1 text-lg" aria-hidden>
                {nextUp.icon}
              </span>
              <strong>{nextUp.name}</strong> — {nextUp.progress!.current}/{nextUp.progress!.target}
            </p>
          ) : (
            <p className="mt-1 text-slate-600">
              Claim a slot on the{" "}
              <Link href="/dashboard" className="font-medium text-emerald-700">
                dashboard map
              </Link>{" "}
              to start earning.
            </p>
          )}
        </div>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const group = badges.filter((b) => b.category === category);
        if (!group.length) return null;
        return (
          <section key={category} aria-labelledby={`cat-${category}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id={`cat-${category}`} className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {category}
              </h2>
              <p className="text-xs text-slate-400">{CATEGORY_BLURB[category]}</p>
            </div>
            <BadgeGrid badges={group.map((b) => ({ ...b, unlockedAt: b.unlockedAt?.toISOString() ?? null }))} />
          </section>
        );
      })}
    </div>
  );
}
