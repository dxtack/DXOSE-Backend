ALTER TABLE "stock_count_sessions"
ADD COLUMN "postingDate" TIMESTAMP(3),
ADD COLUMN "assignedPostingPeriod" TEXT;

ALTER TABLE "saved_stock_reports"
ADD COLUMN "postingDate" TIMESTAMP(3),
ADD COLUMN "assignedPostingPeriod" TEXT;

CREATE INDEX "stock_count_sessions_tenantId_postingDate_idx"
ON "stock_count_sessions"("tenantId", "postingDate");

CREATE INDEX "stock_count_sessions_tenantId_assignedPostingPeriod_idx"
ON "stock_count_sessions"("tenantId", "assignedPostingPeriod");

CREATE INDEX "saved_stock_reports_tenantId_postingDate_idx"
ON "saved_stock_reports"("tenantId", "postingDate");

CREATE INDEX "saved_stock_reports_tenantId_assignedPostingPeriod_idx"
ON "saved_stock_reports"("tenantId", "assignedPostingPeriod");
