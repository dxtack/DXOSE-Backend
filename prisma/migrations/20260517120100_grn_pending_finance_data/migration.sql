-- Migrate stale APPROVED (not yet posted) rows after PENDING_FINANCE enum value exists.
UPDATE "grn_imports"
SET "status" = 'PENDING_FINANCE'
WHERE "status" = 'APPROVED'
  AND "postedAt" IS NULL;
