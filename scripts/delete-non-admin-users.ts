// Deletes every user except ADMIN accounts, with all of their data.
//
//   npx tsx scripts/delete-non-admin-users.ts            # dry run: prints what would be removed
//   npx tsx scripts/delete-non-admin-users.ts --confirm  # actually deletes
//
// Database rows: Quest (→ Verification → PlantedTree), Order, Transaction, RedemptionHistory,
// Notification, MissionClaim, UserAchievement, Account, Session and PasswordResetToken all cascade
// from User. The script additionally: restocks open seedling orders, rolls back species planting
// totals, clears referral links (SetNull in the schema) and sign-up leftovers keyed by email, and
// deletes the users' proof media / avatar files from disk after the transaction commits.
import "dotenv/config";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const confirm = process.argv.includes("--confirm");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? path.join(process.cwd(), "storage", "uploads");
const AVATAR_ROOT = process.env.AVATAR_ROOT ?? path.join(process.cwd(), "storage", "avatars");
const MEDIA_KEY = /^[0-9a-zA-Z._-]+$/;

async function removeFile(root: string, key: string | null) {
  if (key && MEDIA_KEY.test(key)) await unlink(path.join(root, key)).catch(() => {});
}

async function main() {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true } });
  if (admins.length === 0) throw new Error("No ADMIN account found — refusing to delete every user.");

  const doomed = await prisma.user.findMany({
    where: { role: { not: "ADMIN" } },
    select: { id: true, email: true, avatarUrl: true },
  });
  const ids = doomed.map((u) => u.id);
  const emails = doomed.map((u) => u.email).filter((e): e is string => !!e);

  const [verifications, planted, openOrders] = await Promise.all([
    prisma.verification.findMany({ where: { quest: { userId: { in: ids } } }, select: { mediaUrl: true } }),
    prisma.plantedTree.groupBy({
      by: ["speciesId"],
      where: { userId: { in: ids }, speciesId: { not: null } },
      _sum: { count: true },
    }),
    prisma.order.findMany({
      where: { userId: { in: ids }, status: { in: ["PENDING", "PACKED", "OUT_FOR_DELIVERY"] } },
      select: { productId: true, quantity: true },
    }),
  ]);

  console.log(`Keeping ${admins.length} admin(s): ${admins.map((a) => a.email ?? a.id).join(", ")}`);
  console.log(`Users to delete: ${doomed.length}`);
  console.log(`  proof media files: ${verifications.length}, avatars: ${doomed.filter((u) => u.avatarUrl).length}`);
  console.log(`  species totals to roll back: ${planted.length}, open orders to restock: ${openOrders.length}`);

  if (!confirm) {
    console.log("\nDry run only. Re-run with --confirm to delete.");
    return;
  }
  if (doomed.length === 0) return;

  await prisma.$transaction(
    async (tx) => {
      for (const p of planted) {
        await tx.treeSpecies.update({
          where: { id: p.speciesId! },
          data: { totalPlanted: { decrement: p._sum.count ?? 0 } },
        });
      }
      for (const o of openOrders) {
        await tx.seedlingProduct.update({
          where: { id: o.productId },
          data: { stockQuantity: { increment: o.quantity } },
        });
      }
      // Orders restrict product deletion, not user deletion, so the cascade covers them.
      await tx.user.updateMany({ where: { referredByUserId: { in: ids } }, data: { referredByUserId: null } });
      if (emails.length) {
        await tx.pendingRegistration.deleteMany({ where: { email: { in: emails } } });
        await tx.verificationToken.deleteMany({ where: { identifier: { in: emails } } });
      }
      const { count } = await tx.user.deleteMany({ where: { id: { in: ids }, role: { not: "ADMIN" } } });
      console.log(`Deleted ${count} users.`);
    },
    { timeout: 60_000 },
  );

  // Files are removed only after the DB commit succeeded.
  for (const v of verifications) {
    await removeFile(MEDIA_ROOT, v.mediaUrl.startsWith("/api/media/") ? v.mediaUrl.slice("/api/media/".length) : null);
  }
  for (const u of doomed) {
    await removeFile(AVATAR_ROOT, u.avatarUrl?.startsWith("/api/avatars/") ? u.avatarUrl.slice("/api/avatars/".length) : null);
  }
  console.log("Removed media and avatar files.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
