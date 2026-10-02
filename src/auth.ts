import NextAuth, { CredentialsSignin } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { isGoogleEnabled } from "@/lib/auth-providers";
import { prisma } from "@/lib/prisma";
import { attachReferral, REFERRAL_COOKIE } from "@/lib/referrals";
import { verifyCredentials } from "@/lib/registration";
import type { Role } from "@/generated/prisma/client";

/** Login failure surfaced to the login page as ?code=… (invalid | unverified | rate_limited). */
class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // JWT sessions are required for the Credentials provider.
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  logger: {
    // Wrong passwords are expected user errors, not server errors — don't log them as such.
    error(error) {
      if (error instanceof CredentialsSignin) return;
      console.error(error);
    },
  },
  providers: [
    ...(isGoogleEnabled()
      ? [
          Google({
            // Safe here because every account's email is verified: email/password accounts are only
            // created after the inbox link is opened, and Google sign-ins require email_verified.
            // This lets someone who registered with email later "Continue with Google" (and vice versa).
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const result = await verifyCredentials(credentials?.email, credentials?.password);
        if (!result.ok) throw new LoginError(result.code);
        return result.user;
      },
    }),
  ],
  events: {
    // New sign-ups arriving via an invite link (/r/<code>) carry the code in a cookie.
    async createUser({ user }) {
      try {
        const code = (await cookies()).get(REFERRAL_COOKIE)?.value;
        if (code && user.id) await attachReferral(user.id, code);
      } catch (err) {
        console.error("Referral attach failed", err); // never block sign-up
      }
    },
    // Google has verified the address (checked in the signIn callback) — record it.
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id) {
        await prisma.user.updateMany({
          where: { id: user.id, emailVerified: null },
          data: { emailVerified: new Date() },
        });
      }
    },
  },
  callbacks: {
    async signIn({ account, profile }) {
      // Refuse Google accounts whose email Google hasn't verified.
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role?: Role }).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      // Set by the jwt callback above at sign-in.
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
