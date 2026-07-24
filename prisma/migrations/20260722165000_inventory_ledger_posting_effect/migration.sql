-- Posting idempotency keys + effect tracking (schema had fields/tables with no migration).

ALTER TABLE "inventory_ledger" ADD COLUMN IF NOT EXISTS "postingEffectKey" TEXT;

CREATE TABLE IF NOT EXISTS "posting_executions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "executionKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "posting_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "posting_effects" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "effectKey" TEXT NOT NULL,
    "sourceLineId" UUID NOT NULL,
    "effectType" TEXT NOT NULL,
    "ledgerId" UUID,

    CONSTRAINT "posting_effects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "posting_executions_tenantId_sourceType_sourceId_idx"
  ON "posting_executions"("tenantId", "sourceType", "sourceId");

CREATE UNIQUE INDEX IF NOT EXISTS "posting_executions_tenantId_executionKey_key"
  ON "posting_executions"("tenantId", "executionKey");

CREATE INDEX IF NOT EXISTS "posting_effects_executionId_idx"
  ON "posting_effects"("executionId");

CREATE INDEX IF NOT EXISTS "posting_effects_ledgerId_idx"
  ON "posting_effects"("ledgerId");

CREATE UNIQUE INDEX IF NOT EXISTS "posting_effects_tenantId_effectKey_key"
  ON "posting_effects"("tenantId", "effectKey");

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_ledger_tenantId_postingEffectKey_key"
  ON "inventory_ledger"("tenantId", "postingEffectKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posting_effects_executionId_fkey'
  ) THEN
    ALTER TABLE "posting_effects"
      ADD CONSTRAINT "posting_effects_executionId_fkey"
      FOREIGN KEY ("executionId") REFERENCES "posting_executions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;