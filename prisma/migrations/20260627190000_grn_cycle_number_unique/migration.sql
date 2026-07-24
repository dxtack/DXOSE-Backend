-- Phase 2 gate — prevent duplicate approval cycles per GRN
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_grnImportId_cycleNumber_key"
  ON "approval_requests" ("grnImportId", "cycleNumber")
  WHERE "grnImportId" IS NOT NULL;
