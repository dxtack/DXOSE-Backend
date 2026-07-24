-- Persist Cost Control approval timestamp on GRN (Official Evidence / timeline).
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
