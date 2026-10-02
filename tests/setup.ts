import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";
import { afterAll, vi } from "vitest";

// Tests run against TEST_DATABASE_URL (see README) — never the dev/prod database.
config({ path: ".env.test", quiet: true });
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. Add it to .env.test (see README → Testing).");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// `prisma dev` (PGlite) drops connections under concurrent use, so use a single connection
// unless the test DB is a real Postgres (TEST_DB_CONCURRENCY=1).
if (process.env.TEST_DB_CONCURRENCY !== "1") process.env.DATABASE_POOL_MAX ??= "1";

// Close this file's DB pool when it finishes — leaked connections pile up across files and
// can take down a single-connection test server (prisma dev / PGlite).
afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});

// Uploaded media goes to a throwaway directory.
const mediaRoot = mkdtempSync(path.join(os.tmpdir(), "ecoquest-media-"));
process.env.MEDIA_ROOT = mediaRoot;
process.env.AVATAR_ROOT = path.join(mediaRoot, "avatars");
afterAll(() => rmSync(mediaRoot, { recursive: true, force: true }));

// Outgoing email is captured, never sent: inspect vi.mocked(sendEmail).mock.calls.
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  sendEmail: vi.fn(async () => {}),
}));

// Session is controlled per test via `signInAs()` in tests/helpers.ts.
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));
