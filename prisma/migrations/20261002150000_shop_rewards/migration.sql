-- Shop & rewards. Written to be safe on databases that already contain rewards/redemptions.

-- Reward: face value + visibility. Existing rewards get valuePesos = 0 — set real values in /admin/rewards.
ALTER TABLE "Reward" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "valuePesos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Reward" ALTER COLUMN "valuePesos" DROP DEFAULT;

CREATE INDEX "Reward_isActive_idx" ON "Reward"("isActive");

-- RedemptionHistory: record what was charged. Backfill existing rows from the reward's current cost.
ALTER TABLE "RedemptionHistory" ADD COLUMN "pointsSpent" INTEGER;
UPDATE "RedemptionHistory" rh SET "pointsSpent" = r."costPoints" FROM "Reward" r WHERE r."id" = rh."rewardId";
ALTER TABLE "RedemptionHistory" ALTER COLUMN "pointsSpent" SET NOT NULL;
