ALTER TABLE "tenants"
ADD COLUMN "timezone" TEXT;

UPDATE "tenants"
SET "timezone" = 'Asia/Riyadh'
WHERE "timezone" IS NULL;

ALTER TABLE "tenants"
ALTER COLUMN "timezone" SET DEFAULT 'Asia/Riyadh',
ALTER COLUMN "timezone" SET NOT NULL;
