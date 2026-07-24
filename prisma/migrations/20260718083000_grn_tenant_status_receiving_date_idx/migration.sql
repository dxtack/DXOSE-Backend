-- Period-close blockers filter by receivingDate within UTC month bounds.
CREATE INDEX IF NOT EXISTS "grn_imports_tenantId_status_receivingDate_idx"
ON "grn_imports" ("tenantId", "status", "receivingDate");
