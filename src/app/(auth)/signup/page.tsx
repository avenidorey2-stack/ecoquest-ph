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
      <h1 className="text-center text-lg font-semibold">Create your account</h1>

      {isGoogleEnabled() && (
        <>
          <form action={loginWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label="Sign up with Google" />
          </form>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" /> or with email <span className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      <SignupForm devMailbox={isDevMailboxEnabled()} />

      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-green-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
