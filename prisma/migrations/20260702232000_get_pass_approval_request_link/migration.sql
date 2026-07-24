ALTER TYPE "ApprovalRequestType" ADD VALUE IF NOT EXISTS 'GET_PASS';

ALTER TABLE "approval_requests"
  ADD COLUMN IF NOT EXISTS "getPassId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_getPassId_key"
  ON "approval_requests"("getPassId");

CREATE INDEX IF NOT EXISTS "approval_requests_getPassId_idx"
  ON "approval_requests"("getPassId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'approval_requests_getPassId_fkey'
  ) THEN
    ALTER TABLE "approval_requests"
      ADD CONSTRAINT "approval_requests_getPassId_fkey"
      FOREIGN KEY ("getPassId") REFERENCES "get_passes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
