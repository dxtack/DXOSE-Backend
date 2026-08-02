-- Enforce at most one PUBLISHED AccWorkflowVersion per AccWorkflowDefinition.
-- Application publish/restore transactions archive prior published rows first;
-- this index closes the race window under concurrent publish.

-- Archive duplicate published versions (keep newest by publishedAt, then versionNumber).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "definitionId"
      ORDER BY "publishedAt" DESC NULLS LAST, "versionNumber" DESC, "createdAt" DESC
    ) AS rn
  FROM "acc_workflow_versions"
  WHERE "status" = 'PUBLISHED'
)
UPDATE "acc_workflow_versions" AS v
SET "status" = 'ARCHIVED'
FROM ranked
WHERE v.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "acc_workflow_versions_one_published_per_definition"
  ON "acc_workflow_versions" ("definitionId")
  WHERE "status" = 'PUBLISHED';
