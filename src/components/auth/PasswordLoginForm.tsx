"use client";

import { useActionState } from "react";
import { loginWithPassword } from "@/app/(auth)/actions";

export default function PasswordLoginForm({ callbackUrl, email }: { callbackUrl: string; email?: string }) {
  const [state, action, pending] = useActionState(loginWithPassword, undefined);
  const input = "mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 sm:text-sm";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={email} required className={input} />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 transition hover:bg-emerald-800 hover:shadow-md motion-safe:active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
