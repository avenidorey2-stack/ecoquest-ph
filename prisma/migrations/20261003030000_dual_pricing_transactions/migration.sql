-- Order statuses: FULFILLED → DELIVERED (keeps existing rows), then add the packing/delivery steps.
-- Resulting order: PENDING, PACKED, OUT_FOR_DELIVERY, DELIVERED, CANCELLED.
ALTER TYPE "OrderStatus" RENAME VALUE 'FULFILLED' TO 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE 'PACKED' BEFORE 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE 'OUT_FOR_DELIVERY' BEFORE 'DELIVERED';

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('POINTS', 'PESOS');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('SEEDLING_ORDER', 'REWARD_REDEMPTION', 'REFUND');

-- AlterTable: existing orders were all paid in points.
ALTER TABLE "Order" ADD COLUMN     "currencyUsed" "Currency" NOT NULL DEFAULT 'POINTS',
ALTER COLUMN "totalPrice" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SeedlingProduct" ADD COLUMN     "priceInPesos" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "maxParticipants" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "redemptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "RedemptionHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the history from existing seedling orders, reward redemptions and their refunds.
INSERT INTO "Transaction" ("id", "userId", "kind", "currency", "amount", "description", "orderId", "createdAt")
SELECT 'txo_' || o."id", o."userId", 'SEEDLING_ORDER', o."currencyUsed", o."totalPrice",
       o."quantity" || ' × ' || s."name" || CASE WHEN o."quantity" = 1 THEN ' seedling' ELSE ' seedlings' END,
       o."id", o."createdAt"
FROM "Order" o
JOIN "SeedlingProduct" p ON p."id" = o."productId"
JOIN "TreeSpecies" s ON s."id" = p."speciesId";

INSERT INTO "Transaction" ("id", "userId", "kind", "currency", "amount", "description", "redemptionId", "createdAt")
SELECT 'txr_' || r."id", r."userId", 'REWARD_REDEMPTION', 'POINTS', r."pointsSpent",
       '₱' || w."valuePesos" || ' ' || w."brand" || CASE WHEN w."rewardType" = 'VOUCHER' THEN ' voucher' ELSE ' cashout' END,
       r."id", r."createdAt"
FROM "RedemptionHistory" r
JOIN "Reward" w ON w."id" = r."rewardId";

INSERT INTO "Transaction" ("id", "userId", "kind", "currency", "amount", "description", "redemptionId", "createdAt")
SELECT 'txf_' || r."id", r."userId", 'REFUND', 'POINTS', r."pointsSpent",
       'Refund: ₱' || w."valuePesos" || ' ' || w."brand" || ' request declined',
       r."id", COALESCE(r."processedAt", r."updatedAt")
FROM "RedemptionHistory" r
JOIN "Reward" w ON w."id" = r."rewardId"
WHERE r."status" = 'REJECTED';
