-- Governance Freeze v1 Phase 1: optional tenant-member scope overrides
ALTER TABLE "tenant_members"
ADD COLUMN IF NOT EXISTS "canViewAllDepartments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "canViewAllLocations" BOOLEAN NOT NULL DEFAULT false;
