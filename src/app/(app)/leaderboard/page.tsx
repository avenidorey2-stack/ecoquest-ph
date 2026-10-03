import Link from "next/link";
import ActivePill from "@/components/ui/ActivePill";
import { requirePageUserId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getLeaderboard, type LeaderboardScope } from "@/lib/leaderboard";
import { getPendingCelebrations } from "@/lib/celebrations";
import ClimbHighlight from "@/components/gamification/ClimbHighlight";
import PlanterProfileTrigger from "@/components/leaderboard/PlanterProfileTrigger";

const MEDALS = ["🥇", "🥈", "🥉"];
const fmtDay = (d: Date) => d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

function timeUntil(target: Date) {
  const hours = Math.max(0, Math.round((target.getTime() - Date.now()) / 3_600_000));
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
}

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const viewerId = await requirePageUserId();
  const viewer = await prisma.user.findUniqueOrThrow({
    where: { id: viewerId },
    select: { cityCode: true, city: true, role: true },
  });

  const requested = (await searchParams).scope;
  const scope: LeaderboardScope =
    requested === "national" || requested === "local" ? requested : viewer.cityCode ? "local" : "national";
  const needsCity = scope === "local" && !viewer.cityCode;

  const board = needsCity ? null : await getLeaderboard({ scope, cityCode: viewer.cityCode, viewerId });
  // A climb since the user last looked (acknowledged from the dashboard toast).
  const { rankUp } = await getPendingCelebrations(viewerId);
  const climb = rankUp && rankUp.scope === scope ? rankUp : null;
  const weekEnd = board && new Date(board.resetsAt.getTime() - 1);

  const tab = (value: LeaderboardScope, label: string) => (
    <Link
      href={`/leaderboard?scope=${value}`}
      aria-current={scope === value ? "page" : undefined}
      className={`relative flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors ${
        scope === value ? "text-emerald-800" : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {scope === value && <ActivePill id="leaderboard-scope" className="inset-0 rounded-md bg-white shadow" />}
      <span className="relative">{label}</span>
    </Link>
  );

  return (
    <div className="eq-stagger mx-auto w-full max-w-2xl space-y-6 px-4 py-6 text-slate-900 sm:px-6 lg:py-8">
      <header>
        <h1 className="text-xl font-semibold">Weekly leaderboard</h1>
        {board && weekEnd && (
          <p className="text-sm text-slate-500">
            {fmtDay(board.weekStart)} – {fmtDay(weekEnd)} · resets in {timeUntil(board.resetsAt)} (Monday 12:00 AM PHT)
          </p>
        )}
      </header>

      <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" aria-label="Leaderboard scope">
        {tab("local", viewer.city ? `Local · ${viewer.city}` : "Local")}
        {tab("national", "National")}
      </nav>

      {needsCity ? (
        <Link
          href="/profile"
          className="block rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 hover:bg-amber-100"
        >
          <span className="font-medium">Set your home city</span> to see how you rank against planters near you
        </Link>
      ) : (
        board && (
          <>
            {viewer.role === "USER" && (
              <section className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Your rank</p>
                  <p className="text-2xl font-bold text-emerald-800">
                    {board.viewer.rank ? `#${board.viewer.rank}` : "—"}
                    {board.viewer.rank && (
                      <span className="ml-1 text-sm font-normal text-emerald-700">of {board.totalRanked}</span>
                    )}
                  </p>
                </div>
                <p className="text-right text-sm text-emerald-800">
                  <span className="text-2xl font-bold">{board.viewer.weeklyPoints}</span> pts
                  {!board.viewer.rank && <span className="block text-xs">Earn points this week to get ranked</span>}
                </p>
              </section>
            )}

            {board.entries.length === 0 ? (
              <p className="rounded-2xl border border-slate-200/80 bg-white shadow-sm p-6 text-center text-sm text-slate-500">
                No one has earned points yet this week. Plant a tree and claim the top spot! 🌱
              </p>
            ) : (
              <ol className="eq-stagger divide-y overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                {board.entries.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`relative flex items-center gap-3 px-4 py-3 ${entry.isViewer ? "bg-emerald-50" : ""}`}
                    aria-current={entry.isViewer ? "true" : undefined}
                  >
                    <PlanterProfileTrigger userId={entry.userId} name={entry.name} />
                    <span className="w-8 text-center text-lg font-semibold text-slate-500">
                      {MEDALS[entry.rank - 1] ?? entry.rank}
                    </span>
                    {entry.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded avatar or OAuth photo
                      <img src={entry.image} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700">
                        {entry.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {entry.name}
                        {entry.isViewer && <span className="ml-1 text-xs text-emerald-700">(you)</span>}
                        <span
                          className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-bold text-amber-700 ring-1 ring-amber-200"
                          title={`Level ${entry.level}`}
                        >
                          Lv {entry.level}
                        </span>
                        {entry.isViewer && climb && <ClimbHighlight from={climb.from} to={climb.to} />}
                      </p>
                      {scope === "national" && entry.city && (
                        <p className="truncate text-xs text-slate-500">
                          {entry.city}, {entry.province}
                        </p>
                      )}
                    </div>
                    <span className="font-semibold text-emerald-700">{entry.weeklyPoints} pts</span>
                  </li>
                ))}
              </ol>
            )}

            {board.totalRanked > board.entries.length && (
              <p className="text-center text-xs text-slate-500">
                Showing the top {board.entries.length} of {board.totalRanked} planters.
              </p>
            )}
          </>
        )
      )}
    </div>
  );
}
