-- P19: ACC runtime settings (DB SSOT for feature flags)
CREATE TABLE IF NOT EXISTS "acc_runtime_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acc_runtime_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "acc_runtime_settings_tenantId_key_key"
  ON "acc_runtime_settings"("tenantId", "key");
CREATE INDEX IF NOT EXISTS "acc_runtime_settings_key_idx" ON "acc_runtime_settings"("key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_runtime_settings_tenantId_fkey') THEN
    ALTER TABLE "acc_runtime_settings"
      ADD CONSTRAINT "acc_runtime_settings_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_runtime_settings_updatedById_fkey') THEN
    ALTER TABLE "acc_runtime_settings"
      ADD CONSTRAINT "acc_runtime_settings_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- P20: workflow step permission + status key
ALTER TABLE "acc_workflow_step_definitions" ADD COLUMN IF NOT EXISTS "permissionId" UUID;
ALTER TABLE "acc_workflow_step_definitions" ADD COLUMN IF NOT EXISTS "statusKey" TEXT;
CREATE INDEX IF NOT EXISTS "acc_workflow_step_definitions_permissionId_idx"
  ON "acc_workflow_step_definitions"("permissionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acc_workflow_step_definitions_permissionId_fkey') THEN
    ALTER TABLE "acc_workflow_step_definitions"
      ADD CONSTRAINT "acc_workflow_step_definitions_permissionId_fkey"
      FOREIGN KEY ("permissionId") REFERENCES "ur_permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- P22: GRN workflow pin
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "accWorkflowVersionId" UUID;
ALTER TABLE "grn_imports" ADD COLUMN IF NOT EXISTS "approvalRequestId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "grn_imports_approvalRequestId_key" ON "grn_imports"("approvalRequestId");
CREATE INDEX IF NOT EXISTS "grn_imports_accWorkflowVersionId_idx" ON "grn_imports"("accWorkflowVersionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_imports_accWorkflowVersionId_fkey') THEN
    ALTER TABLE "grn_imports"
      ADD CONSTRAINT "grn_imports_accWorkflowVersionId_fkey"
      FOREIGN KEY ("accWorkflowVersionId") REFERENCES "acc_workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_imports_approvalRequestId_fkey') THEN
    ALTER TABLE "grn_imports"
      ADD CONSTRAINT "grn_imports_approvalRequestId_fkey"
      FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- P23: Requisition workflow pin
ALTER TABLE "store_requisitions" ADD COLUMN IF NOT EXISTS "accWorkflowVersionId" UUID;
ALTER TABLE "store_requisitions" ADD COLUMN IF NOT EXISTS "approvalRequestId" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "store_requisitions_approvalRequestId_key" ON "store_requisitions"("approvalRequestId");
CREATE INDEX IF NOT EXISTS "store_requisitions_accWorkflowVersionId_idx" ON "store_requisitions"("accWorkflowVersionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_requisitions_accWorkflowVersionId_fkey') THEN
    ALTER TABLE "store_requisitions"
      ADD CONSTRAINT "store_requisitions_accWorkflowVersionId_fkey"
      FOREIGN KEY ("accWorkflowVersionId") REFERENCES "acc_workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_requisitions_approvalRequestId_fkey') THEN
    ALTER TABLE "store_requisitions"
      ADD CONSTRAINT "store_requisitions_approvalRequestId_fkey"
      FOREIGN KEY ("approvalRequestId") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
