-- Chapter 6 D1-D12: Period Registry, Snapshot Versioning, Ledger attribution, Auto Close

-- Enums
CREATE TYPE "PeriodCloseStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');
CREATE TYPE "SnapshotVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED');
CREATE TYPE "ReportVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- Period closes: prepare for NOT NULL month
ALTER TABLE "period_closes" ADD COLUMN IF NOT EXISTS "legacyAnnualPendingReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "period_closes" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Flag §6.18 conflicts: month IS NULL and December row exists for same tenant/year
UPDATE "period_closes" AS annual
SET "legacyAnnualPendingReview" = true
WHERE annual."month" IS NULL
  AND EXISTS (
    SELECT 1 FROM "period_closes" AS dec
    WHERE dec."tenantId" = annual."tenantId"
      AND dec."year" = annual."year"
      AND dec."month" = 12
      AND dec."id" <> annual."id"
  );

-- Non-conflict legacy annual rows: map to December (operational registry monthly-only)
UPDATE "period_closes" AS annual
SET "month" = 12
WHERE annual."month" IS NULL
  AND annual."legacyAnnualPendingReview" = false;

-- Remaining null months (conflicts): assign month=12 but keep review flag
UPDATE "period_closes"
SET "month" = 12
WHERE "month" IS NULL;

ALTER TABLE "period_closes" ALTER COLUMN "month" SET NOT NULL;

-- Status enum migration
ALTER TABLE "period_closes" ADD COLUMN "status_new" "PeriodCloseStatus" NOT NULL DEFAULT 'OPEN';
UPDATE "period_closes" SET "status_new" = CASE
  WHEN UPPER("status") = 'CLOSED' THEN 'CLOSED'::"PeriodCloseStatus"
  WHEN UPPER("status") = 'CLOSING' THEN 'CLOSING'::"PeriodCloseStatus"
  ELSE 'OPEN'::"PeriodCloseStatus"
END;
ALTER TABLE "period_closes" DROP COLUMN "status";
ALTER TABLE "period_closes" RENAME COLUMN "status_new" TO "status";
CREATE INDEX "period_closes_tenantId_status_idx" ON "period_closes"("tenantId", "status");

-- Snapshot versioning tables
CREATE TABLE "period_snapshot_versions" (
    "id" UUID NOT NULL,
    "periodCloseId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "SnapshotVersionStatus" NOT NULL DEFAULT 'CURRENT',
    "closedAt" TIMESTAMP(3),
    "closedBy" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "period_snapshot_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "period_snapshot_lines" (
    "id" UUID NOT NULL,
    "snapshotVersionId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "closingQty" DECIMAL(15,4) NOT NULL,
    "closingValue" DECIMAL(15,4) NOT NULL,
    "wacUnitCost" DECIMAL(15,4) NOT NULL,
    CONSTRAINT "period_snapshot_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "period_snapshot_versions_periodCloseId_versionNumber_key" ON "period_snapshot_versions"("periodCloseId", "versionNumber");
CREATE INDEX "period_snapshot_versions_periodCloseId_status_idx" ON "period_snapshot_versions"("periodCloseId", "status");

CREATE UNIQUE INDEX "period_snapshot_lines_snapshotVersionId_itemId_locationId_key" ON "period_snapshot_lines"("snapshotVersionId", "itemId", "locationId");
CREATE INDEX "period_snapshot_lines_snapshotVersionId_idx" ON "period_snapshot_lines"("snapshotVersionId");

ALTER TABLE "period_snapshot_versions" ADD CONSTRAINT "period_snapshot_versions_periodCloseId_fkey" FOREIGN KEY ("periodCloseId") REFERENCES "period_closes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_snapshot_lines" ADD CONSTRAINT "period_snapshot_lines_snapshotVersionId_fkey" FOREIGN KEY ("snapshotVersionId") REFERENCES "period_snapshot_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_snapshot_lines" ADD CONSTRAINT "period_snapshot_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "period_snapshot_lines" ADD CONSTRAINT "period_snapshot_lines_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate legacy flat snapshots → version 1 CURRENT per period
INSERT INTO "period_snapshot_versions" ("id", "periodCloseId", "versionNumber", "status", "closedAt", "closedBy", "createdAt")
SELECT
  gen_random_uuid(),
  pc."id",
  1,
  'CURRENT'::"SnapshotVersionStatus",
  pc."closedAt",
  pc."closedBy",
  COALESCE(pc."closedAt", pc."createdAt", CURRENT_TIMESTAMP)
FROM "period_closes" pc
WHERE EXISTS (SELECT 1 FROM "period_snapshots" ps WHERE ps."periodCloseId" = pc."id");

INSERT INTO "period_snapshot_lines" ("id", "snapshotVersionId", "itemId", "locationId", "closingQty", "closingValue", "wacUnitCost")
SELECT
  gen_random_uuid(),
  psv."id",
  ps."itemId",
  ps."locationId",
  ps."closingQty",
  ps."closingValue",
  ps."wacUnitCost"
FROM "period_snapshots" ps
JOIN "period_snapshot_versions" psv ON psv."periodCloseId" = ps."periodCloseId" AND psv."versionNumber" = 1;

-- Drop legacy snapshot FK then table (data migrated)
ALTER TABLE "period_snapshots" DROP CONSTRAINT IF EXISTS "period_snapshots_periodCloseId_fkey";
DROP TABLE IF EXISTS "period_snapshots";

-- Inventory ledger period attribution
ALTER TABLE "inventory_ledger" ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3);
ALTER TABLE "inventory_ledger" ADD COLUMN IF NOT EXISTS "assignedPostingPeriod" TEXT;
CREATE INDEX IF NOT EXISTS "inventory_ledger_tenantId_postingDate_idx" ON "inventory_ledger"("tenantId", "postingDate");
CREATE INDEX IF NOT EXISTS "inventory_ledger_tenantId_assignedPostingPeriod_idx" ON "inventory_ledger"("tenantId", "assignedPostingPeriod");

-- Backfill ledger from createdAt where missing
UPDATE "inventory_ledger"
SET "postingDate" = "createdAt",
    "assignedPostingPeriod" = to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM')
WHERE "postingDate" IS NULL;

-- Generated reports versioning
ALTER TABLE "generated_reports" ADD COLUMN IF NOT EXISTS "snapshotVersionId" UUID;
ALTER TABLE "generated_reports" ADD COLUMN IF NOT EXISTS "versionStatus" "ReportVersionStatus" NOT NULL DEFAULT 'CURRENT';
CREATE INDEX IF NOT EXISTS "generated_reports_snapshotVersionId_idx" ON "generated_reports"("snapshotVersionId");
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_snapshotVersionId_fkey" FOREIGN KEY ("snapshotVersionId") REFERENCES "period_snapshot_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Auto close settings per tenant
CREATE TABLE "period_auto_close_settings" (
    "tenantId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dayOfMonth" INTEGER NOT NULL DEFAULT 5,
    "executionTime" TEXT NOT NULL DEFAULT '02:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "period_auto_close_settings_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "period_auto_close_settings" ADD CONSTRAINT "period_auto_close_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
