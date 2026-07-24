-- Phase 2 — GRN approval history linkage (unlimited cycles)
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "grnImportId" UUID;
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "cycleNumber" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "approval_requests_grnImportId_idx" ON "approval_requests"("grnImportId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'approval_requests_grnImportId_fkey'
  ) THEN
    ALTER TABLE "approval_requests"
      ADD CONSTRAINT "approval_requests_grnImportId_fkey"
      FOREIGN KEY ("grnImportId") REFERENCES "grn_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Active GRN approval requests: link history FK for rows currently pointed by grn_imports.approvalRequestId
UPDATE "approval_requests" ar
SET "grnImportId" = g.id
FROM "grn_imports" g
WHERE g."approvalRequestId" = ar.id
  AND ar."requestType" = 'GRN_IMPORT'
  AND ar."grnImportId" IS NULL;
