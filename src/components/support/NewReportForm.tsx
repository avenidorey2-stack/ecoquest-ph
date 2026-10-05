"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";

/** Starts a problem report, then opens its conversation. */
export default function NewReportForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send your report.");
      router.push(`/settings/support/${data.id}`);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No connection. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium text-ink-2">
        What&apos;s the Problem?
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required placeholder="e.g. The map won't load" className={input} />
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Details
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          required
          rows={5}
          placeholder="What happened, on which page, and what did you expect? Your phone model helps too."
          className={`${input} resize-y`}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Send Report"}
      </button>
    </form>
  );
}
