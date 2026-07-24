-- CreateEnum
CREATE TYPE "AuditWriteQueueStatus" AS ENUM ('PENDING', 'COMPLETED', 'DEAD');

-- CreateTable
CREATE TABLE "audit_write_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" UUID NOT NULL,
    "note" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" "AuditWriteQueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_write_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_write_queue_status_nextRetryAt_idx" ON "audit_write_queue"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "audit_write_queue_tenantId_idx" ON "audit_write_queue"("tenantId");

-- AddForeignKey
ALTER TABLE "audit_write_queue" ADD CONSTRAINT "audit_write_queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
