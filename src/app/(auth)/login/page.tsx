import Link from "next/link";
import { redirect } from "next/navigation";
import { isGoogleEnabled } from "@/lib/auth-providers";
import { getCurrentUser } from "@/lib/authz";
import { safeCallbackUrl } from "@/lib/url";
import { loginWithGoogle } from "../actions";
import PasswordLoginForm from "@/components/auth/PasswordLoginForm";
import GoogleButton from "@/components/auth/GoogleButton";

// Messages for Auth.js redirects to /login?error=…
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "That Google account's email isn't verified by Google, so it can't be used here.",
  OAuthAccountNotLinked: "This email is already registered. Sign in with your email and password.",
  CredentialsSignin: "Wrong email or password.",
  Configuration: "Sign-in is temporarily unavailable. Please try again later.",
  GoogleUnavailable: "Google sign-in isn't available right now. Use your email and password instead.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  // Check the DB too: a stale session for a deleted user must not bounce between here and the app.
  if (await getCurrentUser()) redirect(callbackUrl);

  const error = typeof params.error === "string" ? (ERROR_MESSAGES[params.error] ?? "Sign-in failed. Please try again.") : null;
  const email = typeof params.email === "string" ? params.email : undefined;
  const notice =
    params.registered === "1"
      ? "Email confirmed and account created! Sign in below."
      : params.reset === "1"
        ? "Password updated! Sign in with your new password."
        : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-3">Sign in to continue your planting quests.</p>
      </div>

      {notice && <p className="rounded-lg bg-emerald-400/10 p-3 text-sm text-emerald-300">{notice}</p>}
      {error && (
        <p className="rounded-lg bg-red-400/10 p-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      {isGoogleEnabled() && (
        <>
          <form action={loginWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label="Continue with Google" />
          </form>
          <div className="flex items-center gap-3 text-xs text-ink-4">
            <span className="h-px flex-1 bg-card-3" /> or <span className="h-px flex-1 bg-card-3" />
          </div>
        </>
      )}

      <PasswordLoginForm callbackUrl={callbackUrl} email={email} />

      <p className="text-center text-sm">
        <Link href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"} className="text-emerald-400">
          Forgot your password?
        </Link>
      </p>

      <p className="text-center text-sm text-ink-2">
        New here?{" "}
        <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-emerald-400">
          Create an account
        </Link>
      </p>
    </div>
  );
}
