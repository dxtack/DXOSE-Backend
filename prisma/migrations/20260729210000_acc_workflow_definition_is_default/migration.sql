-- Add isDefault flag for canonical workflow definition per module.
ALTER TABLE "acc_workflow_definitions" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "acc_workflow_definitions_moduleId_isDefault_idx"
  ON "acc_workflow_definitions"("moduleId", "isDefault");

-- At most one default definition per module.
CREATE UNIQUE INDEX IF NOT EXISTS "acc_workflow_definitions_one_default_per_module"
  ON "acc_workflow_definitions"("moduleId")
  WHERE "isDefault" = true;

-- Backfill: prefer active definition that currently has a PUBLISHED version,
-- else the oldest active definition per module.
WITH ranked AS (
  SELECT
    d.id,
    ROW_NUMBER() OVER (
      PARTITION BY d."moduleId"
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM "acc_workflow_versions" v
          WHERE v."definitionId" = d.id AND v.status = 'PUBLISHED'
        ) THEN 0 ELSE 1 END,
        d."createdAt" ASC
    ) AS rn
  FROM "acc_workflow_definitions" d
  WHERE d."isActive" = true
)
UPDATE "acc_workflow_definitions" d
SET "isDefault" = true
FROM ranked r
WHERE d.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM "acc_workflow_definitions" x
    WHERE x."moduleId" = d."moduleId" AND x."isDefault" = true
  );
