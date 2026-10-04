-- AlterTable
ALTER TABLE "Quest" ADD COLUMN     "expiresAt" TIMESTAMP(3);


-- Claims already in progress get a full week from now, so nobody's claim ends the day this ships.
UPDATE "Quest" SET "expiresAt" = NOW() + INTERVAL '7 days'
WHERE "status" IN ('ACTIVE', 'PENDING_VERIFICATION');
