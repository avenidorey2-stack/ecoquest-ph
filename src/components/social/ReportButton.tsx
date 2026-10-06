"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportReason } from "@/generated/prisma/enums";
import { FlagIcon } from "@/components/ui/icons";

// The planter-facing choices (admins see the shorter REPORT_REASONS labels from lib/moderation).
const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "HARASSMENT", label: "Harassment or Bullying", hint: "Insults, threats or unwanted messages." },
  { value: "INAPPROPRIATE_CONTENT", label: "Inappropriate Photos or Comments", hint: "Nudity, violence or hateful posts." },
  { value: "SPAM", label: "Spam or Scam", hint: "Ads, fake offers or asking for money." },
  { value: "FAKE_ACCOUNT", label: "Fake Account", hint: "Pretending to be someone else." },
  { value: "CHEATING", label: "Cheating", hint: "Fake plantings or reused proof photos." },
  { value: "OTHER", label: "Something Else", hint: "Tell us below." },
];
const DETAILS_MAX = 500;

/**
 * "Report" on a planter's profile: pick a reason, add details, send to the admins. The planter
 * isn't told who reported them; the reporter gets a notification once the team has reviewed it.
 */
export default function ReportButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const titleId = useId();

  function close() {
    setOpen(false);
    setError(null);
    if (sent) {
      setSent(false);
      setReason(null);
      setDetails("");
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Choose a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/reports/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, details }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Couldn't send the report. Check your connection and try again.");
      return;
    }
    setSent(true);
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-canvas/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="eq-tool-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-line-strong bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink shadow-2xl sm:rounded-3xl"
      >
        {sent ? (
          <div className="space-y-3 py-2 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/30">
              <FlagIcon className="h-7 w-7" />
            </span>
            <h2 id={titleId} className="text-lg font-semibold">
              Thanks for Telling Us
            </h2>
            <p className="text-sm text-ink-2">
              Our team will review your report about <strong>{name}</strong>. They won&apos;t know it was you. We&apos;ll notify
              you once it&apos;s reviewed.
            </p>
            <button type="button" onClick={close} autoFocus className="min-h-11 w-full rounded-xl bg-emerald-400 font-bold text-emerald-950">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                Report {name}
              </h2>
              <p className="mt-0.5 text-sm text-ink-3">What&apos;s wrong with this profile? Only our team sees reports.</p>
            </div>
            <fieldset className="space-y-2">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                    reason === r.value ? "border-emerald-400/60 bg-emerald-400/10" : "border-line hover:bg-card-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="h-4 w-4 shrink-0 accent-emerald-400"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="block text-xs text-ink-3">{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="block text-sm font-medium text-ink-2">
              Details {reason === "OTHER" ? "" : <span className="font-normal text-ink-4">(optional)</span>}
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={DETAILS_MAX}
                rows={3}
                required={reason === "OTHER"}
                placeholder="What happened, and where (a photo, a comment, a message)?"
                className="mt-1.5 block w-full resize-none rounded-xl border border-line-strong bg-card-2 px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-4 focus:border-emerald-400/60 sm:text-sm"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={close} className="min-h-11 flex-1 rounded-xl border border-line-strong font-semibold hover:bg-card-2">
                Cancel
              </button>
              <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-rose-500 font-bold text-white hover:bg-rose-400 disabled:opacity-50">
                {busy ? "Sending…" : "Send Report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 rounded-xl px-3 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"
      >
        Report
      </button>
      {open && createPortal(dialog, document.body)}
    </>
  );
}
