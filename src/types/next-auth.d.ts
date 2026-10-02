import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

// The JWT payload (token.id / token.role) is typed where it's read, in src/auth.ts: npm nests
// @auth/core under next-auth (nodemailer override), so a JWT module augmentation can't reach it.
