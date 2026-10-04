import Link from "next/link";
import { findPendingByToken, MIN_PASSWORD_LENGTH } from "@/lib/registration";
import CompleteSignupForm from "@/components/auth/CompleteSignupForm";

// Opened from the confirmation email. Viewing this page doesn't use up the link
// (email scanners that prefetch links can't break it); submitting the form does.
export default async function CompleteSignupPage({ searchParams }: PageProps<"/signup/complete">) {
  const { token } = await searchParams;
  const pending = await findPendingByToken(token);

  if (!pending || typeof token !== "string") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-4xl" aria-hidden>
          ⌛
        </p>
        <h1 className="text-lg font-bold text-ink">This link is invalid or has expired</h1>
        <p className="text-sm text-ink-2">
          Confirmation links work once and expire after 24 hours. If you already finished signing up, just sign in.
        </p>
        <div className="flex gap-2">
          <Link href="/signup" className="flex-1 rounded-lg bg-emerald-400 py-2 text-sm font-semibold text-emerald-950">
            Sign up again
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
      <h1 className="text-2xl font-bold tracking-tight text-ink">Finish creating your account</h1>
      <CompleteSignupForm
        token={token}
        email={pending.email}
        initialName={pending.name}
        minPasswordLength={MIN_PASSWORD_LENGTH}
      />
    </div>
  );
}
