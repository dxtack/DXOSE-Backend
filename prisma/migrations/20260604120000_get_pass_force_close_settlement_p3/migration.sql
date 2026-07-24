-- P3 Force Close Settlement — prior status + rejection/cancel stamps
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementPriorStatus" "GetPassStatus";
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementRejectionReason" TEXT;
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementRejectedBy" UUID;
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementRejectedAt" TIMESTAMP(3);
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementCancelledBy" UUID;
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "settlementCancelledAt" TIMESTAMP(3);
