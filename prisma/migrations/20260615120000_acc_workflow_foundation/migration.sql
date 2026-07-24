-- ACC Big Bang Stage S3 — additive workflow definition schema + roles.description

-- CreateEnum
CREATE TYPE "AccWorkflowVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN "description" TEXT;

-- CreateTable
CREATE TABLE "acc_modules" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_workflow_definitions" (
    "id" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_workflow_versions" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "AccWorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_workflow_step_definitions" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "label" TEXT,
    "approverRoleId" UUID,
    "capabilityCode" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_workflow_step_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acc_modules_key_key" ON "acc_modules"("key");

-- CreateIndex
CREATE INDEX "acc_workflow_definitions_moduleId_idx" ON "acc_workflow_definitions"("moduleId");

-- CreateIndex
CREATE INDEX "acc_workflow_definitions_tenantId_idx" ON "acc_workflow_definitions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "acc_workflow_definitions_moduleId_key_tenantId_key" ON "acc_workflow_definitions"("moduleId", "key", "tenantId");

-- CreateIndex
CREATE INDEX "acc_workflow_versions_definitionId_status_idx" ON "acc_workflow_versions"("definitionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "acc_workflow_versions_definitionId_versionNumber_key" ON "acc_workflow_versions"("definitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "acc_workflow_step_definitions_approverRoleId_idx" ON "acc_workflow_step_definitions"("approverRoleId");

-- CreateIndex
CREATE UNIQUE INDEX "acc_workflow_step_definitions_versionId_stepOrder_key" ON "acc_workflow_step_definitions"("versionId", "stepOrder");

-- AddForeignKey
ALTER TABLE "acc_workflow_definitions" ADD CONSTRAINT "acc_workflow_definitions_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "acc_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_workflow_definitions" ADD CONSTRAINT "acc_workflow_definitions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_workflow_versions" ADD CONSTRAINT "acc_workflow_versions_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "acc_workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_workflow_step_definitions" ADD CONSTRAINT "acc_workflow_step_definitions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "acc_workflow_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_workflow_step_definitions" ADD CONSTRAINT "acc_workflow_step_definitions_approverRoleId_fkey" FOREIGN KEY ("approverRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
