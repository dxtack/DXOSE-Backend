-- Per-user read receipts for Workflow Pipeline header alerts
CREATE TABLE IF NOT EXISTS "workflow_alert_reads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "alertId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_alert_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workflow_alert_reads_userId_alertId_key"
  ON "workflow_alert_reads"("userId", "alertId");

CREATE INDEX IF NOT EXISTS "workflow_alert_reads_userId_tenantId_idx"
  ON "workflow_alert_reads"("userId", "tenantId");

CREATE INDEX IF NOT EXISTS "workflow_alert_reads_tenantId_alertId_idx"
  ON "workflow_alert_reads"("tenantId", "alertId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_alert_reads_userId_fkey'
  ) THEN
    ALTER TABLE "workflow_alert_reads"
      ADD CONSTRAINT "workflow_alert_reads_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workflow_alert_reads_tenantId_fkey'
  ) THEN
    ALTER TABLE "workflow_alert_reads"
      ADD CONSTRAINT "workflow_alert_reads_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
