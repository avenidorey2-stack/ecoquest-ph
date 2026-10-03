// Database connection strings. Locally DATABASE_URL is set; on Vercel with the Supabase
// integration the POSTGRES_* variables are injected instead (POSTGRES_PRISMA_URL = transaction
// pooler for the app, POSTGRES_URL_NON_POOLING = session connection for migrations).
// Kept free of app imports: prisma.config.ts loads this file too.

/** Connection string for the running app (pooled). */
export function runtimeDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  return url && withLibpqSsl(url);
}

/** Connection string for `prisma migrate` (needs a session, not a transaction pooler). */
export function migrationDatabaseUrl() {
  return process.env.DIRECT_DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL;
}

/**
 * node-postgres treats `sslmode=require` as verify-full, which rejects Supabase's certificate
 * chain. `uselibpqcompat=true` restores the standard libpq meaning: encrypted, not verified
 * (verify-ca / verify-full in the URL still verify).
 */
function withLibpqSsl(url: string) {
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("sslmode");
    if (mode === "require" || mode === "prefer") {
      if (!parsed.searchParams.has("uselibpqcompat")) parsed.searchParams.set("uselibpqcompat", "true");
      return parsed.toString();
    }
  } catch {
    // Not a URL we can parse — use it as given.
  }
  return url;
}
