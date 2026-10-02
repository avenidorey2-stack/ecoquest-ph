import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiter backed by the database (works across server instances).
 * Records a hit for `key` and returns false if the limit for the current window is exceeded.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.rateLimit.findUnique({ where: { key } });

    if (!row || row.windowStart.getTime() <= now.getTime() - windowMs) {
      await tx.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: now },
        update: { count: 1, windowStart: now },
      });
      return true;
    }
    if (row.count >= limit) return false;

    await tx.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  });
}

/** Deletes counters whose window ended over a day ago (all windows are ≤ 1 day). */
export async function pruneRateLimits(now = new Date()) {
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
}

/**
 * Client IP for rate limiting. Assumes the app runs behind a proxy that sets
 * X-Forwarded-For (Vercel, nginx, Cloudflare…); falls back to a shared bucket.
 */
export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}
