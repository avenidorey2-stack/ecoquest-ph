-- Old "new slot" notifications only linked to /dashboard. Point each one at its slot on the
-- dashboard map (/dashboard?slot=<id>), read or not. The message doesn't hold the slot id, so the
-- slot is the latest one created at or just before the notice (within 10 minutes), in the same
-- city with the same tree. Notices whose slot was renamed or erased since keep their old link.
UPDATE "Notification" n
SET "link" = '/dashboard?slot=' || m."slotId"
FROM (
  SELECT
    o."id",
    (
      SELECT s."id"
      FROM "Slot" s
      WHERE starts_with(o."message", 'New planting slot available in ' || s."city" || ': ' || s."requiredPlantType" || ' · ')
        AND s."createdAt" <= o."createdAt"
        AND s."createdAt" > o."createdAt" - INTERVAL '10 minutes'
      ORDER BY s."createdAt" DESC
      LIMIT 1
    ) AS "slotId"
  FROM "Notification" o
  WHERE o."message" LIKE 'New planting slot available in %'
    AND (o."link" IS NULL OR o."link" = '/dashboard')
) m
WHERE n."id" = m."id" AND m."slotId" IS NOT NULL;
