import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { runtimeDatabaseUrl } from "@/lib/database-url";

// Dev keeps one client across hot reloads. It's tagged with the PrismaClient class it was built
// from: `prisma generate` (e.g. after a migration) hot-reloads a new class, and the stale client —
// which doesn't know the new models — is replaced instead of reused.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

function createClient() {
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined; // pg default (10) when unset
  const adapter = new PrismaPg({ connectionString: runtimeDatabaseUrl(), max });
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;
if (!cached && globalForPrisma.prisma) {
  // Release the outdated client's connections (matters for single-connection dev databases).
  void globalForPrisma.prisma.$disconnect().catch(() => {});
}

export const prisma = cached ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}
