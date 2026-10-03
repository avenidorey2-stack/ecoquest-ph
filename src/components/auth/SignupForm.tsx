"use client";

import { useEffect, useState } from "react";

const RESEND_SECONDS = 60;

/** `devMailbox`: emails go to the local /dev/mailbox page instead of a real inbox (development only). */
export default function SignupForm({ devMailbox = false }: { devMailbox?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, website }),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
      return;
    }
    setSentTo(email.trim());
    setCooldown(RESEND_SECONDS);
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl" aria-hidden>
          📬
        </p>
        <h2 className="font-semibold">Check your inbox</h2>
        <p className="text-sm text-slate-600">
          If <strong>{sentTo}</strong> can be registered, we&apos;ve sent it a link to confirm your email and set your
          password. It expires in 24 hours — check your spam folder too.
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={send}
          disabled={busy || cooldown > 0}
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-medium transition hover:bg-slate-50 motion-safe:active:scale-[0.98] disabled:text-slate-400"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : busy ? "Sending…" : "Resend email"}
        </button>
        <button onClick={() => setSentTo(null)} className="text-sm text-emerald-700">
          Use a different email
        </button>
      </div>
    );
  }

  const input = "mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 sm:text-sm";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-slate-700">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required className={input} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className={input} />
      </label>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-800 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email me a confirmation link"}
      </button>
      <p className="text-xs text-slate-500">You&apos;ll set your password after confirming your email.</p>
    </form>
  );
}
