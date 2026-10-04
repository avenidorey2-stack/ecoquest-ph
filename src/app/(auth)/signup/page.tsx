import Link from "next/link";
import { redirect } from "next/navigation";
import { isGoogleEnabled } from "@/lib/auth-providers";
import { getCurrentUser } from "@/lib/authz";
import { isDevMailboxEnabled } from "@/lib/dev-mailbox";
import { safeCallbackUrl } from "@/lib/url";
import { loginWithGoogle } from "../actions";
import SignupForm from "@/components/auth/SignupForm";
import GoogleButton from "@/components/auth/GoogleButton";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  if (await getCurrentUser()) redirect(callbackUrl);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-3">Start planting native trees and earning rewards.</p>
      </div>

      {isGoogleEnabled() && (
        <>
          <form action={loginWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label="Sign up with Google" />
          </form>
          <div className="flex items-center gap-3 text-xs text-ink-4">
            <span className="h-px flex-1 bg-card-3" /> or with email <span className="h-px flex-1 bg-card-3" />
          </div>
        </>
      )}

      <SignupForm devMailbox={isDevMailboxEnabled()} />

      <p className="text-center text-sm text-ink-2">
        Already have an account?{" "}
        <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-emerald-400">
          Sign in
        </Link>
      </p>
    </div>
  );
}
