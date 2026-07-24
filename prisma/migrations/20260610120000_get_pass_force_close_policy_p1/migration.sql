-- CreateEnum
CREATE TYPE "GetPassClosedVia" AS ENUM ('SIMPLE', 'FORCE_SETTLEMENT');

-- AlterEnum
ALTER TYPE "GetPassStatus" ADD VALUE 'PENDING_FORCE_CLOSE_SETTLEMENT' BEFORE 'CLOSED';

-- AlterTable
ALTER TABLE "get_passes"
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "closedVia" "GetPassClosedVia",
ADD COLUMN     "settlementPayload" JSONB,
ADD COLUMN     "settlementSubmittedBy" UUID,
ADD COLUMN     "settlementSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "settlementApprovedBy" UUID,
ADD COLUMN     "settlementApprovedAt" TIMESTAMP(3);
