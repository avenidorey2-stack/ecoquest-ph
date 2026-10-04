"use client";

import { useState } from "react";

export default function ForgotPasswordForm({ initialEmail, devMailbox }: { initialEmail: string; devMailbox: boolean }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl" aria-hidden>
          📬
        </p>
        <p className="text-sm text-ink-2">
          If <strong>{sentTo}</strong> has an account, we&apos;ve emailed it a link to choose a new password. The link
          expires in 1 hour.
        </p>
        {devMailbox && (
          <a
            href="/dev/mailbox"
            target="_blank"
            className="block rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200 hover:bg-amber-400/15"
          >
            <strong>Development mode:</strong> no real email is sent. Open the dev mailbox
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink-4 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm"
        />
      </label>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-black/20 transition hover:bg-emerald-300 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
