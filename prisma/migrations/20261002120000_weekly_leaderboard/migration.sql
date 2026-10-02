-- DropIndex
DROP INDEX "User_cityCode_idx";

-- DropIndex
DROP INDEX "User_weeklyPoints_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "weeklyPointsWeekStart" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_weeklyPointsWeekStart_weeklyPoints_idx" ON "User"("weeklyPointsWeekStart", "weeklyPoints");

-- CreateIndex
CREATE INDEX "User_cityCode_weeklyPointsWeekStart_weeklyPoints_idx" ON "User"("cityCode", "weeklyPointsWeekStart", "weeklyPoints");
