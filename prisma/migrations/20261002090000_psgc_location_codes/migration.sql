-- Geofencing now uses PSGC city codes. Slot.cityCode is required: if your database already has
-- slots, set their cityCode (or delete them) before applying - this ALTER fails on non-empty tables.
-- DropIndex
DROP INDEX "Slot_province_city_idx";

-- DropIndex
DROP INDEX "User_city_idx";

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "cityCode" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cityCode" TEXT,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Slot_cityCode_idx" ON "Slot"("cityCode");

-- CreateIndex
CREATE INDEX "User_cityCode_idx" ON "User"("cityCode");
