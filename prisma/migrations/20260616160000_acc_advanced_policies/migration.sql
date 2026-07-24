-- ACC Big Bang Stage S12 — Advanced Policies (additive only)

CREATE TYPE "AccFieldAccessLevel" AS ENUM ('HIDDEN', 'READ_ONLY', 'READ_WRITE');
CREATE TYPE "AccUserExceptionType" AS ENUM ('PERMISSION_GRANT', 'PERMISSION_DENY', 'TEMPORARY_ELEVATION', 'FIELD_ACCESS');

CREATE TABLE "acc_field_security_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "roleId" UUID,
    "userId" UUID,
    "resourceCode" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "accessLevel" "AccFieldAccessLevel" NOT NULL DEFAULT 'READ_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_field_security_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acc_user_exceptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignmentId" UUID,
    "exceptionType" "AccUserExceptionType" NOT NULL,
    "permissionId" UUID,
    "resourceCode" TEXT,
    "fieldKey" TEXT,
    "payload" JSONB,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_user_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acc_scheduled_access" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "roleId" UUID,
    "label" TEXT NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acc_scheduled_access_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "acc_field_security_rules_tenantId_resourceCode_idx" ON "acc_field_security_rules"("tenantId", "resourceCode");
CREATE INDEX "acc_field_security_rules_roleId_idx" ON "acc_field_security_rules"("roleId");
CREATE INDEX "acc_field_security_rules_userId_idx" ON "acc_field_security_rules"("userId");

CREATE INDEX "acc_user_exceptions_userId_isActive_idx" ON "acc_user_exceptions"("userId", "isActive");
CREATE INDEX "acc_user_exceptions_assignmentId_idx" ON "acc_user_exceptions"("assignmentId");

CREATE INDEX "acc_scheduled_access_tenantId_idx" ON "acc_scheduled_access"("tenantId");
CREATE INDEX "acc_scheduled_access_userId_idx" ON "acc_scheduled_access"("userId");
CREATE INDEX "acc_scheduled_access_roleId_idx" ON "acc_scheduled_access"("roleId");

ALTER TABLE "acc_field_security_rules" ADD CONSTRAINT "acc_field_security_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_field_security_rules" ADD CONSTRAINT "acc_field_security_rules_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_field_security_rules" ADD CONSTRAINT "acc_field_security_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "acc_user_exceptions" ADD CONSTRAINT "acc_user_exceptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_user_exceptions" ADD CONSTRAINT "acc_user_exceptions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ur_user_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_user_exceptions" ADD CONSTRAINT "acc_user_exceptions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "ur_permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "acc_scheduled_access" ADD CONSTRAINT "acc_scheduled_access_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_scheduled_access" ADD CONSTRAINT "acc_scheduled_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acc_scheduled_access" ADD CONSTRAINT "acc_scheduled_access_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
