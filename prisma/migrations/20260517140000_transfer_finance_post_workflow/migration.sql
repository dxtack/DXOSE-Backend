-- Store transfer: finance-controlled posting (POSTED terminal state)

ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'POSTED';

ALTER TABLE "store_transfers"
  ADD COLUMN IF NOT EXISTS "postedBy" UUID,
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_transfers_postedBy_fkey'
  ) THEN
    ALTER TABLE "store_transfers"
      ADD CONSTRAINT "store_transfers_postedBy_fkey"
      FOREIGN KEY ("postedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Data backfill that sets status = 'POSTED' lives in the next migration so the new enum
-- value is committed before use (PostgreSQL 55P04).
