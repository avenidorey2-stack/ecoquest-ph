-- CreateEnum
CREATE TYPE "MissionKind" AS ENUM ('DAILY', 'SIDE');

-- CreateEnum
CREATE TYPE "MissionObjective" AS ENUM ('PLANT_TREES', 'SUBMIT_PROOF', 'BUY_SEEDLINGS', 'INVITE_FRIENDS', 'REDEEM_REWARD');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "kind" "MissionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "objective" "MissionObjective" NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "rewardXp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionClaim" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mission_kind_isActive_idx" ON "Mission"("kind", "isActive");

-- CreateIndex
CREATE INDEX "MissionClaim_userId_claimedAt_idx" ON "MissionClaim"("userId", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionClaim_missionId_userId_periodKey_key" ON "MissionClaim"("missionId", "userId", "periodKey");

-- AddForeignKey
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionClaim" ADD CONSTRAINT "MissionClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

