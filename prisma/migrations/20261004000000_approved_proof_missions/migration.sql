-- "Submit planting proof" quests now count only admin-approved proofs (by approval day).
-- Data only: refresh the starter quest's wording, unless an admin has already edited it.
UPDATE "Mission"
SET "description" = 'Get a planting proof approved today.', "updatedAt" = CURRENT_TIMESTAMP
WHERE "objective" = 'SUBMIT_PROOF' AND "description" = 'Submit a planting proof today.';
