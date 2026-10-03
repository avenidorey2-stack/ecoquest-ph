-- Quests end as CANCELLED (instead of being deleted) when their slot is closed or removed,
-- so approved plants, points and proof stay on the planter's record.
ALTER TYPE "QuestStatus" ADD VALUE 'CANCELLED';
