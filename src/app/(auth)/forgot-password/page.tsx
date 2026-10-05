import Link from "next/link";
import { isDevMailboxEnabled } from "@/lib/dev-mailbox";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { email } = await searchParams;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Forgot your password?</h1>
        <p className="mt-1 text-sm text-ink-3">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <ForgotPasswordForm initialEmail={typeof email === "string" ? email : ""} devMailbox={isDevMailboxEnabled()} />
      <p className="text-center text-sm">
        <Link href="/login" className="text-emerald-400">
          Back to Sign In
        </Link>
      </p>
    </div>
  );
}
