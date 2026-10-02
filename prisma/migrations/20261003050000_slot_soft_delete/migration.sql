-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Slot_deletedAt_idx" ON "Slot"("deletedAt");

