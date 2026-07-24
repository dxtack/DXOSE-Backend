-- Inventory Count (v1) schema additions
-- Canonical model: StockCountSession / StockCountLine
-- Adds: session-level blindMode + scoped locations + per item×location counted quantities (round-based)

-- 1) Extend stock_count_sessions
ALTER TABLE "stock_count_sessions"
  ADD COLUMN IF NOT EXISTS "blindMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "departmentId" UUID,
  ADD COLUMN IF NOT EXISTS "categoryId" UUID,
  ADD COLUMN IF NOT EXISTS "currentRound" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "stock_count_sessions_tenantId_departmentId_idx"
  ON "stock_count_sessions"("tenantId", "departmentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_sessions_departmentId_fkey'
  ) THEN
    ALTER TABLE "stock_count_sessions"
      ADD CONSTRAINT "stock_count_sessions_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_sessions_categoryId_fkey'
  ) THEN
    ALTER TABLE "stock_count_sessions"
      ADD CONSTRAINT "stock_count_sessions_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Scoped locations join table
CREATE TABLE IF NOT EXISTS "stock_count_session_locations" (
  "sessionId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  CONSTRAINT "stock_count_session_locations_pkey" PRIMARY KEY ("sessionId","locationId")
);

CREATE INDEX IF NOT EXISTS "stock_count_session_locations_locationId_idx"
  ON "stock_count_session_locations"("locationId");

-- Guard FK creation for re-runs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_session_locations_sessionId_fkey') THEN
    ALTER TABLE "stock_count_session_locations"
      ADD CONSTRAINT "stock_count_session_locations_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_session_locations_locationId_fkey') THEN
    ALTER TABLE "stock_count_session_locations"
      ADD CONSTRAINT "stock_count_session_locations_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) Per item×location quantities table (round-based)
CREATE TABLE IF NOT EXISTS "stock_count_location_qtys" (
  "id" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "itemId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "roundNo" INTEGER NOT NULL DEFAULT 1,
  "bookQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "countedQty" DECIMAL(15,4),
  "varianceQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
  "countedBy" UUID,
  "countedAt" TIMESTAMP(3),
  "countNote" TEXT,
  CONSTRAINT "stock_count_location_qtys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_count_location_qtys_sessionId_itemId_locationId_round_key"
  ON "stock_count_location_qtys"("sessionId", "itemId", "locationId", "roundNo");

CREATE INDEX IF NOT EXISTS "stock_count_location_qtys_sessionId_locationId_roundNo_idx"
  ON "stock_count_location_qtys"("sessionId", "locationId", "roundNo");

CREATE INDEX IF NOT EXISTS "stock_count_location_qtys_itemId_idx"
  ON "stock_count_location_qtys"("itemId");

-- Guard FK creation for re-runs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_location_qtys_sessionId_fkey') THEN
    ALTER TABLE "stock_count_location_qtys"
      ADD CONSTRAINT "stock_count_location_qtys_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "stock_count_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_location_qtys_itemId_fkey') THEN
    ALTER TABLE "stock_count_location_qtys"
      ADD CONSTRAINT "stock_count_location_qtys_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_location_qtys_locationId_fkey') THEN
    ALTER TABLE "stock_count_location_qtys"
      ADD CONSTRAINT "stock_count_location_qtys_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_location_qtys_countedBy_fkey') THEN
    ALTER TABLE "stock_count_location_qtys"
      ADD CONSTRAINT "stock_count_location_qtys_countedBy_fkey"
      FOREIGN KEY ("countedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

