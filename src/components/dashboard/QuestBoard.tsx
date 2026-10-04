"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompletedTask, DashboardQuest } from "@/lib/dashboard";
import type { MissionView } from "@/lib/missions";
import { MISSION_OBJECTIVES } from "@/lib/mission-meta";
import ActivePill from "@/components/ui/ActivePill";
import QuestList from "./QuestList";

type Tab = "daily" | "side" | "planting";

function untilReset(iso: string) {
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}
const fmtDay = (iso: string) =>
  new Date(new Date(iso).getTime() - 1).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

function MissionRow({ m }: { m: MissionView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const meta = MISSION_OBJECTIVES[m.objective];
  const shown = Math.min(m.progress, m.target);
  const pct = Math.round((shown / m.target) * 100);

  async function claim() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/missions/${m.id}/claim`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setMessage({ ok: false, text: (res && (await res.json().catch(() => ({}))).error) ?? "Couldn't claim. Try again." });
      return;
    }
    setMessage({ ok: true, text: `+${m.rewardPoints.toLocaleString("en-PH")} pts claimed!` });
    router.refresh(); // updates points in the header, leaderboard and this list
  }

  return (
    <li className={`rounded-xl p-3 ring-1 ${m.status === "claimed" ? "bg-card-2 ring-line" : m.status === "ready" ? "bg-amber-400/[0.07] ring-amber-400/30" : "bg-card ring-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${m.status === "claimed" ? "text-ink-3" : "text-ink"}`}>
            {m.status === "claimed" && "✓ "}
            {m.title}
          </p>
          <p className="truncate text-xs text-ink-3" title={m.description ?? undefined}>
            {m.description || meta.describe(m.target)}
            {m.kind === "SIDE" && m.endsAt && ` · ends ${fmtDay(m.endsAt)}`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
          +{m.rewardPoints.toLocaleString("en-PH")} pts{m.rewardXp > 0 && ` · ${m.rewardXp} XP`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2" role="progressbar" aria-valuenow={shown} aria-valuemin={0} aria-valuemax={m.target}>
          <div
            className={`eq-fill h-full rounded-full transition-[width] duration-700 ${m.status === "claimed" ? "bg-line-strong" : "bg-gradient-to-r from-emerald-500 to-emerald-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-ink-2">
          {shown}/{m.target} {meta.unit}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {m.status === "ready" ? (
          <button
            onClick={claim}
            disabled={busy}
            className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-amber-950 shadow-sm hover:bg-amber-400 disabled:opacity-50"
          >
            {busy ? "Claiming…" : `Claim +${m.rewardPoints.toLocaleString("en-PH")} pts`}
          </button>
        ) : m.status === "claimed" ? (
          <span className="text-xs font-medium text-emerald-400">{m.kind === "DAILY" ? "Claimed today — new one tomorrow" : "Completed & claimed"}</span>
        ) : (
          <Link href={meta.href} className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-ink-2 hover:border-emerald-400/40 hover:bg-emerald-400/10 hover:text-emerald-300">
            {meta.action}
          </Link>
        )}
        {message && (
          <span role="status" className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </li>
  );
}

function MissionList({ missions, empty }: { missions: MissionView[]; empty: string }) {
  if (!missions.length) return <p className="rounded-xl bg-card-2 p-4 text-center text-sm text-ink-3">{empty}</p>;
  // Claimable first, then in progress, then already claimed.
  const order = { ready: 0, active: 1, claimed: 2 } as const;
  return (
    <ul className="space-y-2.5">
      {[...missions]
        .sort((a, b) => order[a.status] - order[b.status])
        .map((m) => (
          <MissionRow key={m.id} m={m} />
        ))}
    </ul>
  );
}

/** Quests card: Daily (resets 00:00 PHT) · Side · Planting (slot quests & milestones). */
export default function QuestBoard({
  missions,
  quests,
  completed,
  completedTotal,
}: {
  missions: { daily: MissionView[]; side: MissionView[]; dailyResetsAt: string };
  quests: DashboardQuest[];
  completed: CompletedTask[];
  completedTotal: number;
}) {
  const [tab, setTab] = useState<Tab>("daily");
  const ready = (list: MissionView[]) => list.filter((m) => m.status === "ready").length;
  const dailyDone = missions.daily.filter((m) => m.status === "claimed").length;
  const tabs: { id: Tab; label: string; badge: number }[] = [
    { id: "daily", label: "Daily", badge: ready(missions.daily) },
    { id: "side", label: "Side", badge: ready(missions.side) },
    { id: "planting", label: "Planting", badge: quests.filter((q) => q.uploadQuestId).length },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Quest types" className="flex gap-1 rounded-xl bg-card-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`quest-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`quest-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              tab === t.id ? "text-emerald-300" : "text-ink-3 hover:text-ink"
            }`}
          >
            {tab === t.id && <ActivePill id="quest-tab" className="inset-0 rounded-lg bg-card shadow-sm ring-1 ring-line" />}
            <span className="relative">{t.label}</span>
            {t.badge > 0 && (
              <span className={`relative grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] ${t.id === "planting" ? "bg-emerald-400 text-emerald-950" : "bg-amber-500 text-amber-950"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`quest-panel-${tab}`} aria-labelledby={`quest-tab-${tab}`}>
        {tab === "daily" && (
          <div className="space-y-3">
            <p className="flex items-center justify-between text-xs text-ink-3">
              <span>
                {dailyDone}/{missions.daily.length} done today
              </span>
              {/* Time-based text: server and client renders can differ by a minute. */}
              <span suppressHydrationWarning>Resets in {untilReset(missions.dailyResetsAt)} (12:00 AM PHT)</span>
            </p>
            <MissionList missions={missions.daily} empty="No daily quests today — check back tomorrow." />
          </div>
        )}
        {tab === "side" && <MissionList missions={missions.side} empty="No side quests right now." />}
        {tab === "planting" && <QuestList quests={quests} completed={completed} completedTotal={completedTotal} />}
      </div>
    </div>
  );
}
