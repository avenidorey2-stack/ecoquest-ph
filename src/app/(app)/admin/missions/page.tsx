import Link from "next/link";
import { requireAdminPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import MissionManager from "@/components/admin/MissionManager";

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
        className={`rounded-lg px-4 py-2 text-sm font-medium ${active ? "bg-white text-emerald-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Daily &amp; side quests</h2>
          <p className="text-sm text-slate-500">
            {kind === "DAILY"
              ? "Daily quests reset every day at 12:00 AM PHT. Progress is tracked automatically; planters claim the reward."
              : "Side quests can be completed once while they run (start → end date)."}
          </p>
        </div>
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Quest type">
          {tab("daily", "Daily quests")}
          {tab("side", "Side quests")}
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
