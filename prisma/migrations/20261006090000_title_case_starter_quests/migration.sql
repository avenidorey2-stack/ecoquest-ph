-- Starter quests get Title Case names. Only titles still at their original default are renamed,
-- so quests an admin has renamed keep their names.
UPDATE "Mission" SET "title" = 'Daily Proof' WHERE "title" = 'Daily proof';
UPDATE "Mission" SET "title" = 'Green Day' WHERE "title" = 'Green day';
UPDATE "Mission" SET "title" = 'Seedling Run' WHERE "title" = 'Seedling run';
UPDATE "Mission" SET "title" = 'Stock the Nursery' WHERE "title" = 'Stock the nursery';
UPDATE "Mission" SET "title" = 'Grow the Movement' WHERE "title" = 'Grow the movement';
UPDATE "Mission" SET "title" = 'Treat Yourself' WHERE "title" = 'Treat yourself';
