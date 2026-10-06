"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = "DISMISSED" | "WARNED" | "SUSPENDED" | "BANNED";

const ACTIONS: { value: Action; label: string; hint: string }[] = [
  { value: "DISMISSED", label: "Dismiss", hint: "No rule broken. Reporters are told it was reviewed." },
  { value: "WARNED", label: "Warn", hint: "They get your message as a notification." },
  { value: "SUSPENDED", label: "Suspend", hint: "They can't sign in until it ends." },
  { value: "BANNED", label: "Ban", hint: "Last resort: no sign-in until an admin lifts it." },
];
const DAYS = [1, 7, 30] as const;
const NOTE_MAX = 300;

const chip = (on: boolean) =>
  `min-h-10 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors ${
    on ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/50" : "text-ink-2 ring-line hover:bg-card-2 hover:text-ink"
  }`;

/** The admin's decision for one reported planter (all their open reports at once). */
export default function ReportDecision({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [days, setDays] = useState<(typeof DAYS)[number]>(7);
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsNote = action === "WARNED";
  const ready = !!action && (!needsNote || !!note.trim()) && (action !== "BANNED" || sure);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/reports/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, days, note }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Couldn't save the decision. Try again.");
      return;
    }
    router.refresh();
  }

  const confirmLabel =
    action === "DISMISSED"
      ? "Dismiss Reports"
      : action === "WARNED"
        ? "Send Warning"
        : action === "SUSPENDED"
          ? `Suspend for ${days} Day${days === 1 ? "" : "s"}`
          : "Ban Account";

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={`Decision for ${name}`} className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={action === a.value}
            onClick={() => {
              setAction(a.value);
              setSure(false);
              setError(null);
            }}
            className={chip(action === a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {action && (
        <div className="space-y-3">
          <p className="text-xs text-ink-3">{ACTIONS.find((a) => a.value === action)!.hint}</p>
          {action === "SUSPENDED" && (
            <div role="radiogroup" aria-label="Suspension length" className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
                  {d} Day{d === 1 ? "" : "s"}
                </button>
              ))}
            </div>
          )}
          {action !== "DISMISSED" && (
            <label className="block text-sm font-medium text-ink-2">
              {needsNote ? "Warning Message" : "Reason Shown to Them"}{" "}
              {!needsNote && <span className="font-normal text-ink-4">(optional)</span>}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={2}
                placeholder={needsNote ? "e.g. Please keep comments respectful." : "e.g. Repeated harassment in comments."}
                className="mt-1.5 block w-full resize-none rounded-xl border border-line-strong bg-card-2 px-3 py-2 text-base text-ink outline-none placeholder:text-ink-4 focus:border-emerald-400/60 sm:text-sm"
              />
            </label>
          )}
          {action === "BANNED" && (
            <label className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rose-500" />
              <span>
                I&apos;ve checked the reports. <strong>{name}</strong> won&apos;t be able to sign in until an admin lifts the ban.
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!ready || busy}
            className={`min-h-11 w-full rounded-xl px-4 text-sm font-bold transition disabled:opacity-40 sm:w-auto ${
              action === "BANNED" || action === "SUSPENDED"
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-emerald-400 text-emerald-950 hover:bg-emerald-300"
            }`}
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/** Ends a suspension or ban early, after a confirmation. */
export function LiftRestrictionButton({ userId, name, banned }: { userId: string; name: string; banned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lift() {
    if (!window.confirm(`${banned ? "Lift the ban on" : "End the suspension of"} ${name}? They can sign in again right away.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/restrictions/${encodeURIComponent(userId)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't lift it. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={lift}
        disabled={busy}
        className="min-h-10 rounded-xl px-3 text-sm font-semibold text-emerald-300 ring-1 ring-line hover:bg-card-2 disabled:opacity-50"
      >
        {busy ? "Lifting…" : banned ? "Lift Ban" : "End Suspension"}
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      )}
    </span>
  );
}
