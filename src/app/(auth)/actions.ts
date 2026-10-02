"use server";

import { redirect } from "next/navigation";
import { AuthError, CredentialsSignin } from "next-auth";
import { signIn } from "@/auth";
import { isGoogleEnabled } from "@/lib/auth-providers";
import { safeCallbackUrl } from "@/lib/url";

const LOGIN_MESSAGES: Record<string, string> = {
  invalid: "Wrong email or password.",
  unverified: "Please confirm your email first — check your inbox for the link.",
  rate_limited: "Too many sign-in attempts. Please wait 15 minutes and try again.",
};

export type LoginState = { error?: string } | undefined;

export async function loginWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
  } catch (err) {
    if (err instanceof CredentialsSignin) return { error: LOGIN_MESSAGES[err.code] ?? LOGIN_MESSAGES.invalid };
    if (err instanceof AuthError) return { error: "Sign-in failed. Please try again." };
    throw err; // includes Next's redirect on success
  }
}

export async function loginWithGoogle(formData: FormData) {
  // The button is hidden when Google isn't configured; this guards stale pages and direct posts.
  if (!isGoogleEnabled()) redirect("/login?error=GoogleUnavailable");
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) });
}
