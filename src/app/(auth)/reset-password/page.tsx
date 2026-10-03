import Link from "next/link";
import { findResetToken } from "@/lib/password-reset";
import { MIN_PASSWORD_LENGTH } from "@/lib/registration";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

// Opened from the reset email. Viewing doesn't use up the link; submitting the form does.
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const row = await findResetToken(token);

  if (!row || typeof token !== "string") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl" aria-hidden>
          ⌛
        </p>
        <h1 className="text-lg font-bold text-slate-900">This reset link is invalid or has expired</h1>
        <p className="text-sm text-slate-600">Reset links work once and expire after 1 hour.</p>
        <div className="flex gap-2">
          <Link href="/forgot-password" className="flex-1 rounded-lg bg-emerald-700 py-2 text-sm font-semibold text-white">
            Get a new link
          </Link>
          <Link href="/login" className="flex-1 rounded-lg border py-2 text-sm font-medium">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
      <ResetPasswordForm token={token} email={row.user.email ?? ""} minPasswordLength={MIN_PASSWORD_LENGTH} />
    </div>
  );
}
