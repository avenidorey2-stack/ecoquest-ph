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

  const input = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm";
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
        ✅ <strong>{email}</strong> confirmed. Choose a password to finish.
      </p>
      {/* Lets password managers save the right username. */}
      <input type="email" value={email} autoComplete="username" readOnly hidden />
      <label className="block text-sm">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className={input} />
      </label>
      <label className="block text-sm">
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
        <span className="text-xs text-gray-500">At least {minPasswordLength} characters.</span>
      </label>
      <label className="block text-sm">
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
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
