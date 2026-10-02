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
        <p className="text-sm text-gray-600">
          If <strong>{sentTo}</strong> has an account, we&apos;ve emailed it a link to choose a new password. The link
          expires in 1 hour.
        </p>
        {devMailbox && (
          <a
            href="/dev/mailbox"
            target="_blank"
            className="block rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100"
          >
            <strong>Development mode:</strong> no real email is sent. Open the dev mailbox →
          </a>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm"
        />
      </label>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}
