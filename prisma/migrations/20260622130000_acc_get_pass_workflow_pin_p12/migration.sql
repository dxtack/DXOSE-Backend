-- P12: Pin Get Pass documents to ACC published workflow version
ALTER TABLE "get_passes" ADD COLUMN IF NOT EXISTS "accWorkflowVersionId" UUID;

CREATE INDEX IF NOT EXISTS "get_passes_accWorkflowVersionId_idx" ON "get_passes"("accWorkflowVersionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'get_passes_accWorkflowVersionId_fkey'
  ) THEN
    ALTER TABLE "get_passes"
      ADD CONSTRAINT "get_passes_accWorkflowVersionId_fkey"
      FOREIGN KEY ("accWorkflowVersionId") REFERENCES "acc_workflow_versions"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
