-- Constitution v2.0 Wave 1 foundation fields

ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "supplierInvoiceNumber" TEXT;
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "concurrencyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3);
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "assignedPostingPeriod" TEXT;

UPDATE "grn_imports"
SET "supplierInvoiceNumber" = "grnNumber"
WHERE "supplierInvoiceNumber" IS NULL;

ALTER TABLE "store_transfers" ADD COLUMN IF NOT EXISTS "concurrencyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "store_transfers" ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3);
ALTER TABLE "store_transfers" ADD COLUMN IF NOT EXISTS "assignedPostingPeriod" TEXT;

ALTER TABLE "movement_documents" ADD COLUMN IF NOT EXISTS "concurrencyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "movement_documents" ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3);
ALTER TABLE "movement_documents" ADD COLUMN IF NOT EXISTS "assignedPostingPeriod" TEXT;

ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "concurrencyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "postingDate" TIMESTAMP(3);
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "assignedPostingPeriod" TEXT;

INSERT INTO "tenant_settings" ("id", "tenantId", "key", "value", "updatedAt")
SELECT gen_random_uuid(), t."id", 'displayCurrency', 'SAR', NOW()
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_settings" ts
  WHERE ts."tenantId" = t."id" AND ts."key" = 'displayCurrency'
);
