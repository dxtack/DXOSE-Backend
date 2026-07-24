CREATE TYPE "PeriodOpeningVerificationType" AS ENUM ('CONTINUITY', 'BOOTSTRAP');
CREATE TYPE "PeriodOpeningVerificationStatus" AS ENUM ('PASS', 'FAIL', 'INDETERMINATE', 'INVALIDATED');
CREATE TYPE "PeriodOpeningContinuityClassification" AS ENUM (
    'MATCH',
    'QTY_MISMATCH',
    'WAC_MISMATCH',
    'VALUE_MISMATCH',
    'MULTI_MISMATCH',
    'MISSING_SNAPSHOT_CELL',
    'MISSING_OPENING_CELL',
    'IRRECONSTRUCTIBLE',
    'MULTIPLE_CURRENT_SNAPSHOTS',
    'ACTIVITY_ALREADY_STARTED'
);

CREATE TABLE "period_opening_verifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "targetMonth" INTEGER NOT NULL,
    "verificationType" "PeriodOpeningVerificationType" NOT NULL,
    "status" "PeriodOpeningVerificationStatus" NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "sourcePeriodCloseId" UUID,
    "sourceSnapshotVersionId" UUID,
    "algorithmVersion" TEXT NOT NULL,
    "quantityTolerance" DECIMAL(15,4) NOT NULL,
    "wacTolerance" DECIMAL(15,4) NOT NULL,
    "valueTolerance" DECIMAL(15,4) NOT NULL,
    "snapshotHash" TEXT,
    "ledgerHash" TEXT,
    "openingStockHash" TEXT,
    "evidenceHash" TEXT NOT NULL,
    "generatedBy" UUID,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedBy" UUID,
    "acceptedAt" TIMESTAMP(3),
    "bootstrapReason" TEXT,
    "bootstrapSource" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "period_opening_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_opening_verification_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "verificationId" UUID NOT NULL,
    "itemId" UUID,
    "locationId" UUID,
    "classification" "PeriodOpeningContinuityClassification" NOT NULL,
    "snapshotQty" DECIMAL(15,4),
    "snapshotWac" DECIMAL(15,4),
    "snapshotValue" DECIMAL(15,4),
    "ledgerQty" DECIMAL(15,4),
    "ledgerWac" DECIMAL(15,4),
    "ledgerValue" DECIMAL(15,4),
    "openingQty" DECIMAL(15,4),
    "openingWac" DECIMAL(15,4),
    "openingValue" DECIMAL(15,4),
    "quantityDelta" DECIMAL(15,4),
    "wacDelta" DECIMAL(15,4),
    "valueDelta" DECIMAL(15,4),
    "issueCodes" JSONB,
    CONSTRAINT "period_opening_verification_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "period_closes" ADD COLUMN "openingVerificationId" UUID;

CREATE UNIQUE INDEX "period_closes_openingVerificationId_key"
ON "period_closes"("openingVerificationId");

CREATE INDEX "period_opening_verifications_tenantId_targetYear_targetMonth_isCurrent_idx"
ON "period_opening_verifications"("tenantId", "targetYear", "targetMonth", "isCurrent");

CREATE INDEX "period_opening_verifications_sourceSnapshotVersionId_status_idx"
ON "period_opening_verifications"("sourceSnapshotVersionId", "status");

CREATE INDEX "period_opening_verification_lines_verificationId_classification_idx"
ON "period_opening_verification_lines"("verificationId", "classification");

CREATE INDEX "period_opening_verification_lines_itemId_locationId_idx"
ON "period_opening_verification_lines"("itemId", "locationId");

ALTER TABLE "period_opening_verifications"
ADD CONSTRAINT "period_opening_verifications_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "period_opening_verifications"
ADD CONSTRAINT "period_opening_verifications_sourceSnapshotVersionId_fkey"
FOREIGN KEY ("sourceSnapshotVersionId") REFERENCES "period_snapshot_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "period_opening_verification_lines"
ADD CONSTRAINT "period_opening_verification_lines_verificationId_fkey"
FOREIGN KEY ("verificationId") REFERENCES "period_opening_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "period_closes"
ADD CONSTRAINT "period_closes_openingVerificationId_fkey"
FOREIGN KEY ("openingVerificationId") REFERENCES "period_opening_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
