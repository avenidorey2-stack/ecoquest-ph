"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const RESEND_SECONDS = 60;

/**
 * `devMailbox`: emails go to the local /dev/mailbox page instead of a real inbox (development only).
 * `initialEmail`: prefilled from the login page's "Create an Account" offer.
 * `callbackUrl`: kept on the "Sign In" link shown when the email already has an account.
 */
export default function SignupForm({
  devMailbox = false,
  initialEmail = "",
  callbackUrl = "/dashboard",
}: {
  devMailbox?: boolean;
  initialEmail?: string;
  callbackUrl?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The email that already has an account (from a 409), so the form offers to sign in. */
  const [exists, setExists] = useState<string | null>(null);
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
    setExists(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, website }),
    }).catch(() => null);
    setBusy(false);

    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      if (typeof body?.exists === "string") {
        setExists(body.exists);
        setSentTo(null); // a resend from the "Check Your Inbox" screen goes back to the form
        return;
      }
      setError(body?.error ?? "Something went wrong. Please try again.");
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
        <h2 className="font-semibold">Check Your Inbox</h2>
        <p className="text-sm text-ink-2">
          If <strong>{sentTo}</strong> can be registered, we&apos;ve sent it a link to confirm your email and set your
          password. It expires in 24 hours — check your spam folder too.
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
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={send}
          disabled={busy || cooldown > 0}
          className="w-full rounded-xl border border-line-strong bg-card py-2.5 text-sm font-medium transition hover:bg-card-2 motion-safe:active:scale-[0.98] disabled:text-ink-4"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : busy ? "Sending…" : "Resend Email"}
        </button>
        <button onClick={() => setSentTo(null)} className="text-sm text-emerald-400">
          Use a Different Email
        </button>
      </div>
    );
  }

  const input = "mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink-4 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";
  // Hide the "already has an account" panel as soon as the email is changed.
  const shownExists = exists && exists === email.trim().toLowerCase() ? exists : null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-medium text-ink-2">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" required className={input} />
      </label>
      <label className="block text-sm font-medium text-ink-2">
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
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {shownExists && (
        <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5" role="alert">
          <p className="text-sm text-ink-2">
            <strong className="break-all text-ink">{shownExists}</strong> already has an EcoQuest PH account. Sign in
            instead, or reset your password if you forgot it.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/login?email=${encodeURIComponent(shownExists)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 motion-safe:active:scale-[0.98]"
            >
              Sign In
            </Link>
            <Link
              href={`/forgot-password?email=${encodeURIComponent(shownExists)}`}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink transition hover:bg-card-2 motion-safe:active:scale-[0.98]"
            >
              Reset Password
            </Link>
          </div>
        </div>
      )}
      <button
        disabled={busy}
        className="w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-black/20 transition hover:bg-emerald-300 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Sending…" : "Email Me a Confirmation Link"}
      </button>
      <p className="text-xs text-ink-3">You&apos;ll set your password after confirming your email.</p>
    </form>
  );
}
