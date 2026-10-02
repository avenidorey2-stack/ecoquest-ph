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
      <h1 className="text-center text-lg font-semibold">Sign in</h1>

      {notice && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {isGoogleEnabled() && (
        <>
          <form action={loginWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton label="Continue with Google" />
          </form>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-gray-200" /> or <span className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      <PasswordLoginForm callbackUrl={callbackUrl} email={email} />

      <p className="text-center text-sm">
        <Link href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"} className="text-green-700">
          Forgot your password?
        </Link>
      </p>

      <p className="text-center text-sm text-gray-600">
        New here?{" "}
        <Link href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-medium text-green-700">
          Create an account
        </Link>
      </p>
    </div>
  );
}
