-- AlterTable: primary currency per tenant (ISO 4217). Existing rows default to SAR.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'SAR';

-- Backfill from legacy TenantSetting displayCurrency when present and allowed.
UPDATE "tenants" AS t
SET "currency" = UPPER(TRIM(s."value"))
FROM "tenant_settings" AS s
WHERE s."tenantId" = t."id"
  AND s."key" = 'displayCurrency'
  AND s."value" IS NOT NULL
  AND UPPER(TRIM(s."value")) IN (
    'SAR', 'EGP', 'USD', 'AED', 'QAR', 'KWD', 'BHD', 'OMR', 'EUR'
  );
