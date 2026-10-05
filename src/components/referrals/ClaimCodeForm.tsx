"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ClaimCodeForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/referrals/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't apply that code.");
      return;
    }
    router.replace("/referrals");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Invite Code"
          aria-label="Invite Code"
          required
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-card px-3.5 py-2.5 font-mono text-base shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm"
        />
        <button
          disabled={busy}
          className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-300 motion-safe:active:scale-[0.98] disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
