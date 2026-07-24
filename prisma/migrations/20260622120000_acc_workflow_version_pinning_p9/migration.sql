-- P9 — ACC Workflow Runtime Foundation: pin published workflow version on approval requests.

ALTER TABLE "approval_requests" ADD COLUMN "accWorkflowVersionId" UUID;

CREATE INDEX "approval_requests_accWorkflowVersionId_idx" ON "approval_requests"("accWorkflowVersionId");

ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_accWorkflowVersionId_fkey" FOREIGN KEY ("accWorkflowVersionId") REFERENCES "acc_workflow_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
