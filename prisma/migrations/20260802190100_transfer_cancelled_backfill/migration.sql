-- Backfill: creator self-reject of returned transfers → CANCELLED.
UPDATE "store_transfers"
SET "status" = 'CANCELLED'
WHERE "status" = 'REJECTED'
  AND "rejectedBy" IS NOT NULL
  AND "requestedBy" IS NOT NULL
  AND "rejectedBy" = "requestedBy";
