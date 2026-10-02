"use client";

import { useActionState } from "react";
import { loginWithPassword } from "@/app/(auth)/actions";

export default function PasswordLoginForm({ callbackUrl, email }: { callbackUrl: string; email?: string }) {
  const [state, action, pending] = useActionState(loginWithPassword, undefined);
  const input = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={email} required className={input} />
      </label>
      <label className="block text-sm">
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
        className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
