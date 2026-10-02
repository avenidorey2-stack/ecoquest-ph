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

  const input = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-center text-sm text-gray-600">
        For <strong>{email}</strong>
      </p>
      {/* Lets password managers save the right username. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <label className="block text-sm">
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
        <span className="text-xs text-gray-500">At least {minPasswordLength} characters.</span>
      </label>
      <label className="block text-sm">
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
        className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
