import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import MissionManager from "@/components/admin/MissionManager";
import ActivePill from "@/components/ui/ActivePill";

/** Request time, for Live/Scheduled/Ended badges. */
function requestTime() {
  return new Date();
}

export default async function AdminMissionsPage({ searchParams }: PageProps<"/admin/missions">) {
  await requireAdminPage();
  const kind = (await searchParams).tab === "side" ? "SIDE" : "DAILY";
  const now = requestTime();

  const missions = await prisma.mission.findMany({
    where: { kind },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { claims: true } } },
  });

  const tab = (value: "daily" | "side", label: string) => {
    const active = (value === "side") === (kind === "SIDE");
    return (
      <Link
        href={`/admin/missions?tab=${value}`}
        aria-current={active ? "page" : undefined}
        className={`relative inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium transition-colors ${active ? "text-emerald-300" : "text-ink-2 hover:text-ink"}`}
      >
        {active && <ActivePill id="admin-missions-tab" className="inset-0 rounded-lg bg-card shadow-sm ring-1 ring-line" />}
        <span className="relative">{label}</span>
      </Link>
    );
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Daily &amp; side quests</h2>
          <p className="text-sm text-ink-3">
            {kind === "DAILY"
              ? "Daily quests reset every day at 12:00 AM PHT. Progress is tracked automatically; planters claim the reward."
              : "Side quests can be completed once while they run (start → end date)."}
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-card-2 p-1" aria-label="Quest Type">
          {tab("daily", "Daily Quests")}
          {tab("side", "Side Quests")}
        </nav>
      </div>
      <MissionManager
        key={kind}
        kind={kind}
        missions={missions.map((m) => ({
          id: m.id,
          kind: m.kind,
          title: m.title,
          description: m.description,
          objective: m.objective,
          target: m.target,
          rewardPoints: m.rewardPoints,
          rewardXp: m.rewardXp,
          isActive: m.isActive,
          sortOrder: m.sortOrder,
          startsAt: m.startsAt.toISOString(),
          endsAt: m.endsAt?.toISOString() ?? null,
          claims: m._count.claims,
          state: !m.isActive ? "off" : m.startsAt > now ? "scheduled" : m.endsAt && m.endsAt <= now ? "ended" : "live",
        }))}
      />
    </div>
  );
}
