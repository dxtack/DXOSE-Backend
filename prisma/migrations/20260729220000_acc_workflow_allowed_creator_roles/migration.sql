-- Workflow Builder: initiator / request-creator role allow-list per version.
-- Empty array = any user with module create/access permission may initiate.
ALTER TABLE "acc_workflow_versions"
ADD COLUMN IF NOT EXISTS "allowedCreatorRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
