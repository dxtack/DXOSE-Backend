-- Wave 4: optimistic concurrency for inventory count sessions
ALTER TABLE "stock_count_sessions" ADD COLUMN "concurrencyVersion" INTEGER NOT NULL DEFAULT 0;
