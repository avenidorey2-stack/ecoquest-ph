"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MissionKind, MissionObjective } from "@/generated/prisma/enums";
import { MAX_MISSION_POINTS, MAX_MISSION_TARGET, MAX_MISSION_XP, MISSION_OBJECTIVES } from "@/lib/mission-meta";

export type AdminMission = {
  id: string;
  kind: MissionKind;
  title: string;
  description: string | null;
  objective: MissionObjective;
  target: number;
  rewardPoints: number;
  rewardXp: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string | null;
  sortOrder: number;
  claims: number;
  /** Computed on the server at request time. */
  state: "live" | "scheduled" | "ended" | "off";
};

const STATE_STYLES: Record<AdminMission["state"], { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  scheduled: { label: "Scheduled", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  ended: { label: "Ended", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  off: { label: "Off", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

type Draft = {
  title: string;
  description: string;
  objective: MissionObjective;
  target: string;
  rewardPoints: string;
  rewardXp: string;
  startDate: string;
  endDate: string;
  sortOrder: string;
  isActive: boolean;
};

const OBJECTIVES = Object.keys(MISSION_OBJECTIVES) as MissionObjective[];
/** ISO instant → "YYYY-MM-DD" in Philippine time (for <input type="date">). */
const toPhDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const todayPh = () => toPhDate(new Date().toISOString());

function toDraft(m?: AdminMission): Draft {
  return {
    title: m?.title ?? "",
    description: m?.description ?? "",
    objective: m?.objective ?? "SUBMIT_PROOF",
    target: String(m?.target ?? 1),
    rewardPoints: String(m?.rewardPoints ?? 20),
    rewardXp: String(m?.rewardXp ?? 0),
    startDate: m ? toPhDate(m.startsAt) : todayPh(),
    endDate: m?.endsAt ? toPhDate(new Date(new Date(m.endsAt).getTime() - 1).toISOString()) : "",
    sortOrder: String(m?.sortOrder ?? 0),
    isActive: m?.isActive ?? true,
  };
}

function MissionForm({
  kind,
  mission,
  onDone,
  onCancel,
}: {
  kind: MissionKind;
  mission?: AdminMission;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(mission));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const meta = MISSION_OBJECTIVES[d.objective];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      kind,
      title: d.title,
      description: d.description,
      objective: d.objective,
      target: Number(d.target),
      rewardPoints: Number(d.rewardPoints),
      rewardXp: Number(d.rewardXp),
      sortOrder: Number(d.sortOrder),
      isActive: d.isActive,
      // Dates are Philippine calendar days: starts 00:00 PHT, ends at the end of the chosen day.
      startsAt: `${d.startDate}T00:00:00+08:00`,
      endsAt: d.endDate ? new Date(new Date(`${d.endDate}T00:00:00+08:00`).getTime() + 86_400_000).toISOString() : null,
    };
    const res = await fetch(mission ? `/api/admin/missions/${mission.id}` : "/api/admin/missions", {
      method: mission ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError((res && (await res.json().catch(() => ({}))).error) ?? "Save failed.");
      return;
    }
    onDone();
  }

  const input = "mt-1 block w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <form onSubmit={save} className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <p className="text-sm font-semibold text-slate-900">
        {mission ? "Edit" : "New"} {kind === "DAILY" ? "daily" : "side"} quest
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          Title
          <input className={input} value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={80} required placeholder="e.g. Seedling run" />
        </label>
        <label className="block text-sm sm:col-span-2">
          Description <span className="text-xs text-slate-500">(optional)</span>
          <input className={input} value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={300} placeholder={meta.describe(Number(d.target) || 1)} />
        </label>
        <label className="block text-sm">
          Objective (tracked automatically)
          <select className={input} value={d.objective} onChange={(e) => set("objective", e.target.value as MissionObjective)}>
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {MISSION_OBJECTIVES[o].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Target
          <input className={input} type="number" min={1} max={MAX_MISSION_TARGET} value={d.target} onChange={(e) => set("target", e.target.value)} required />
          <span className="text-xs text-slate-500">
            {meta.describe(Number(d.target) || 1)} {kind === "DAILY" ? "each day" : "while the quest runs"}.
          </span>
        </label>
        <label className="block text-sm">
          Reward points
          <input className={input} type="number" min={0} max={MAX_MISSION_POINTS} value={d.rewardPoints} onChange={(e) => set("rewardPoints", e.target.value)} required />
        </label>
        <label className="block text-sm">
          Reward XP
          <input className={input} type="number" min={0} max={MAX_MISSION_XP} value={d.rewardXp} onChange={(e) => set("rewardXp", e.target.value)} required />
        </label>
        <label className="block text-sm">
          Starts
          <input className={input} type="date" value={d.startDate} onChange={(e) => set("startDate", e.target.value)} required />
        </label>
        <label className="block text-sm">
          Ends <span className="text-xs text-slate-500">(optional, last day)</span>
          <input className={input} type="date" value={d.endDate} min={d.startDate} onChange={(e) => set("endDate", e.target.value)} />
        </label>
        <label className="block text-sm">
          Display order
          <input className={input} type="number" min={-1000} max={1000} value={d.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={d.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          Active (visible to planters)
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
          {saving ? "Saving…" : mission ? "Save changes" : "Create quest"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Admin list + create/edit/toggle/delete for one kind of quest (daily or side). */
export default function MissionManager({ kind, missions }: { kind: MissionKind; missions: AdminMission[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(id: string, init: RequestInit) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/admin/missions/${id}`, init).catch(() => null);
    setBusy(null);
    setConfirmDelete(null);
    if (!res?.ok) {
      setError((res && (await res.json().catch(() => ({}))).error) ?? "Update failed.");
      return;
    }
    router.refresh();
  }
  const done = () => {
    setEditing(null);
    router.refresh();
  };

  const state = (m: AdminMission) => STATE_STYLES[m.state];

  return (
    <div className="space-y-3">
      {editing === "new" ? (
        <MissionForm kind={kind} onDone={done} onCancel={() => setEditing(null)} />
      ) : (
        <button
          onClick={() => setEditing("new")}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          + New {kind === "DAILY" ? "daily" : "side"} quest
        </button>
      )}
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      {missions.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No {kind === "DAILY" ? "daily" : "side"} quests yet.</p>
      ) : (
        <ul className="space-y-3">
          {missions.map((m) =>
            editing === m.id ? (
              <li key={m.id}>
                <MissionForm kind={kind} mission={m} onDone={done} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={m.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{m.title}</p>
                    <p className="text-sm text-slate-600">{m.description || MISSION_OBJECTIVES[m.objective].describe(m.target)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {MISSION_OBJECTIVES[m.objective].label} · target {m.target} · +{m.rewardPoints.toLocaleString("en-PH")} pts
                      {m.rewardXp > 0 && ` · +${m.rewardXp} XP`} · from {toPhDate(m.startsAt)}
                      {m.endsAt && ` to ${toPhDate(new Date(new Date(m.endsAt).getTime() - 1).toISOString())}`} · claimed {m.claims}×
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${state(m).cls}`}>{state(m).label}</span>
                </div>
                {confirmDelete === m.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                    <span className="flex-1">Delete this quest? Rewards already claimed stay with the planters.</span>
                    <button
                      onClick={() => request(m.id, { method: "DELETE" })}
                      disabled={busy === m.id}
                      className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="rounded-md px-2.5 py-1 hover:bg-red-100">
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setEditing(m.id)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50">
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        request(m.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !m.isActive }) })
                      }
                      disabled={busy === m.id}
                      className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {m.isActive ? "Turn off" : "Turn on"}
                    </button>
                    <button onClick={() => setConfirmDelete(m.id)} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-red-700 hover:border-red-300 hover:bg-red-50">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
