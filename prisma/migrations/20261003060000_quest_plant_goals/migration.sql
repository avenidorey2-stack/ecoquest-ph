-- AlterTable
ALTER TABLE "Quest" ADD COLUMN     "targetPlants" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Slot" ADD COLUMN     "questGoal" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Verification" ADD COLUMN     "plantCount" INTEGER NOT NULL DEFAULT 0;

-- Each submission's plant count used to live on its quest: copy it onto the submissions.
UPDATE "Verification" v SET "plantCount" = q."plantCount" FROM "Quest" q WHERE q."id" = v."questId";

-- Quest.plantCount now means "plants approved so far".
-- Completed quests: the goal was what they planted. In-flight quests: nothing approved yet, and
-- a goal of 1 keeps the old behaviour (one approved submission completes the quest).
UPDATE "Quest" SET "targetPlants" = GREATEST("plantCount", 1) WHERE "status" = 'COMPLETED';
UPDATE "Quest" SET "plantCount" = 0 WHERE "status" <> 'COMPLETED';
