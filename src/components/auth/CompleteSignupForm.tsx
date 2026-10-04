"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CompleteSignupForm({
  token,
  email,
  initialName,
  minPasswordLength,
}: {
  token: string;
  email: string;
  initialName: string;
  minPasswordLength: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/register/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(`/login?registered=1&email=${encodeURIComponent(email)}`);
  }

  const input = "mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink-4 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-300">
        ✅ <strong>{email}</strong> confirmed. Choose a password to finish.
      </p>
      {/* Lets password managers save the right username. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <label className="block text-sm font-medium text-ink-2">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className={input} />
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={minPasswordLength}
          autoComplete="new-password"
          required
          className={input}
        />
        <span className="text-xs text-ink-3">At least {minPasswordLength} characters.</span>
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          className={input}
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
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
