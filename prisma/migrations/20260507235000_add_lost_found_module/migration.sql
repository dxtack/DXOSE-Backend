-- CreateEnum
CREATE TYPE "LostFoundStatus" AS ENUM ('FOUND', 'RETURNED');

-- CreateTable
CREATE TABLE "lost_found_items" (
    "id" UUID NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "status" "LostFoundStatus" NOT NULL DEFAULT 'FOUND',
    "photoKey" TEXT,
    "handedOverTo" TEXT,
    "handedOverDate" TIMESTAMP(3),
    "tenantId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lost_found_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lost_found_items_tenantId_status_createdAt_idx" ON "lost_found_items"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "lost_found_items_tenantId_createdAt_idx" ON "lost_found_items"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lost_found_items" ADD CONSTRAINT "lost_found_items_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
