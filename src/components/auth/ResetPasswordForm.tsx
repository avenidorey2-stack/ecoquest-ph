"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordForm({
  token,
  email,
  minPasswordLength,
}: {
  token: string;
  email: string;
  minPasswordLength: number;
}) {
  const router = useRouter();
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
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(`/login?reset=1&email=${encodeURIComponent(email)}`);
  }

  const input = "mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 sm:text-sm";
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-center text-sm text-slate-600">
        For <strong>{email}</strong>
      </p>
      {/* Lets password managers save the right username. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <label className="block text-sm font-medium text-slate-700">
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={minPasswordLength}
          autoComplete="new-password"
          required
          className={input}
        />
        <span className="text-xs text-slate-500">At least {minPasswordLength} characters.</span>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Confirm new password
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
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-800 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
