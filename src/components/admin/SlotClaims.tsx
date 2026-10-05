"use client";

import { useCallback, useEffect, useState } from "react";

type Claim = {
  id: string;
  status: "ACTIVE" | "PENDING_VERIFICATION";
  plantCount: number;
  targetPlants: number;
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
  user: { id: string; name: string | null; email: string | null };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** "YYYY-MM-DD" in Philippine time, for a date input. */
const phDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
/** A week after today, or after the current deadline if that's later. */
const weekLater = (expiresAt: string | null) =>
  phDay(new Date(Math.max(Date.now(), expiresAt ? new Date(expiresAt).getTime() : 0) + 7 * DAY_MS));

/** One planter's claim: deadline, status and a date picker to move the deadline. */
function ClaimRow({ claim, onSaved }: { claim: Claim; onSaved: (notice: string) => void }) {
  const current = claim.expiresAt ? phDay(new Date(claim.expiresAt)) : "";
  const [day, setDay] = useState(() => current || weekLater(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = claim.user.name?.trim() || claim.user.email || "Planter";

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/quests/${claim.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresAt: day }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError((res && (await res.json().catch(() => ({}))).error) || "Couldn't save. Try again.");
      return;
    }
    // The list reloads (and this row re-mounts), so the confirmation is shown above it.
    onSaved(`Saved ${who}'s new end date. They were notified.`);
  }

  const badge = claim.expired
    ? { text: "Expired", cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30" }
    : claim.status === "PENDING_VERIFICATION"
      ? { text: "Proof in Review", cls: "bg-amber-400/15 text-amber-300 ring-amber-400/30" }
      : { text: "Active", cls: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30" };

  return (
    <li className="rounded-xl bg-card-2 p-3 ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{who}</p>
          {claim.user.name && claim.user.email && <p className="truncate text-xs text-ink-3">{claim.user.email}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${badge.cls}`}>{badge.text}</span>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        Claimed {fmt(claim.createdAt)} · {claim.plantCount}/{claim.targetPlants} planted
      </p>
      <p className={`text-xs ${claim.expired ? "text-rose-300" : "text-ink-2"}`}>
        {claim.expiresAt ? `${claim.expired ? "Expired" : "Ends"} ${fmt(claim.expiresAt)}` : "No End Date"}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-ink-2">
          New End Date
          <input
            type="date"
            value={day}
            min={phDay(new Date())}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 block w-full rounded border px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setDay(weekLater(claim.expiresAt))}
          className="min-h-11 rounded-lg border border-line px-3 text-xs font-medium text-ink-2 hover:bg-card-3"
        >
          +7 days
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !day || day === current}
          className="min-h-11 rounded-lg bg-emerald-400 px-4 text-xs font-bold text-emerald-950 hover:bg-emerald-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">Ends at 11:59 PM (PH time) on that day.</p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Admin slot editor: planters with a quest in progress on this slot. Claims last 7 days; an admin
 * can move a claim's end date here (extending an expired claim lets that planter plant again).
 */
export default function SlotClaims({ slotId }: { slotId: string }) {
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/slots/${slotId}/claims`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClaims((await res.json()).claims);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [slotId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, [load]);

  return (
    <section aria-labelledby={`claims-${slotId}`} className="space-y-2 border-t border-line pt-4">
      <h3 id={`claims-${slotId}`} className="text-sm font-semibold text-ink">
        Planter claims{claims && claims.length > 0 ? ` (${claims.length})` : ""}
      </h3>
      <p className="text-xs text-ink-3">Each claim lasts 7 days. After that the planter can&apos;t send proof here unless you change the end date.</p>
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-400/25">
          {notice}
        </p>
      )}
      {failed ? (
        <p className="text-sm text-red-400">
          Couldn&apos;t load claims.{" "}
          <button type="button" onClick={load} className="font-medium text-emerald-400 underline">
            Try Again
          </button>
        </p>
      ) : claims === null ? (
        <div className="h-16 animate-pulse rounded-xl bg-card-2" />
      ) : claims.length === 0 ? (
        <p className="rounded-xl bg-card-2 p-3 text-sm text-ink-3">No one has claimed this slot right now.</p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <ClaimRow
              // A new deadline re-mounts the row, so its date picker starts from the saved date.
              key={`${c.id}-${c.expiresAt}`}
              claim={c}
              onSaved={(text) => {
                setNotice(text);
                load();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
