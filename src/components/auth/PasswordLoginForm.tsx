"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { loginWithPassword } from "@/app/(auth)/actions";

export default function PasswordLoginForm({ callbackUrl, email: initialEmail }: { callbackUrl: string; email?: string }) {
  const [state, action, pending] = useActionState(loginWithPassword, undefined);
  const [email, setEmail] = useState(initialEmail ?? "");
  const emailRef = useRef<HTMLInputElement>(null);
  const input = "mt-1.5 block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-ink shadow-sm outline-none transition placeholder:text-ink-4 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-400/20 sm:text-sm";
  // Hide the "no account" panel as soon as the email is changed.
  const notFound = state?.notFound && state.notFound === email.trim().toLowerCase() ? state.notFound : null;

  function switchEmail() {
    setEmail("");
    emailRef.current?.focus();
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="block text-sm font-medium text-ink-2">
        Email
        <input
          ref={emailRef}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={input}
        />
      </label>
      <label className="block text-sm font-medium text-ink-2">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p className="text-sm text-red-400" role="alert">
          {state.error}
        </p>
      )}
      {notFound && (
        <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5" role="alert">
          <p className="text-sm text-ink-2">
            <strong className="break-all text-ink">{notFound}</strong> isn&apos;t in our database yet. Create an account
            with this email, or sign in with a different one.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/signup?email=${encodeURIComponent(notFound)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 motion-safe:active:scale-[0.98]"
            >
              Create an Account
            </Link>
            <button
              type="button"
              onClick={switchEmail}
              className="min-h-11 flex-1 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink transition hover:bg-card-2 motion-safe:active:scale-[0.98]"
            >
              Use a Different Email
            </button>
          </div>
        </div>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-emerald-950 shadow-sm shadow-black/20 transition hover:bg-emerald-300 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "Signing In…" : "Sign In"}
      </button>
    </form>
  );
}
