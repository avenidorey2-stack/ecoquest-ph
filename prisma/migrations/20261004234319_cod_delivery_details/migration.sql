-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "packedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "barangay" TEXT NOT NULL,
    "cityProvince" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDelivery_orderId_key" ON "OrderDelivery"("orderId");

-- AddForeignKey
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orders already packed or out for delivery: best estimate of when they were packed.
UPDATE "Order" SET "packedAt" = "updatedAt" WHERE "status" IN ('PACKED', 'OUT_FOR_DELIVERY');
