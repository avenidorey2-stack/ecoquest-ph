-- Slots closed before closing ended their quests: end those still-active quests now and tell the
-- planters, exactly as closing a slot does from now on (see endSlotQuests). Quests awaiting review
-- are left alone: reviewing them ends them. Approved plants, points and proof are kept.
-- (A separate migration from the enum change: a new enum value can't be used in the same one.)

INSERT INTO "Notification" ("id", "userId", "message", "link")
SELECT gen_random_uuid()::text, q."userId",
       'The ' || s."requiredPlantType" || ' slot in ' || s."city" ||
       ' was closed by an admin, so your quest there has ended. Plants and points already approved are yours to keep.',
       '/dashboard'
FROM "Quest" q
JOIN "Slot" s ON s."id" = q."slotId"
WHERE q."status" = 'ACTIVE' AND (s."status" = 'CLOSED' OR s."deletedAt" IS NOT NULL);

UPDATE "Quest" q
SET "status" = 'CANCELLED', "updatedAt" = CURRENT_TIMESTAMP
FROM "Slot" s
WHERE s."id" = q."slotId" AND q."status" = 'ACTIVE' AND (s."status" = 'CLOSED' OR s."deletedAt" IS NOT NULL);
