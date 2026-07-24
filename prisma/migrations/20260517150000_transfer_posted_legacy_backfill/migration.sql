-- Backfill: terminal legacy rows that already posted to ledger → POSTED
-- Must run in a separate migration after POSTED enum value is committed.

UPDATE "store_transfers" st
SET
  "status" = 'POSTED',
  "postedAt" = COALESCE(st."receivedAt", st."closedAt", st."updatedAt"),
  "postedBy" = COALESCE(st."receivedBy", st."approvedBy")
WHERE st."status" IN ('RECEIVED', 'CLOSED')
  AND EXISTS (
    SELECT 1 FROM "inventory_ledger" il
    WHERE il."referenceType" = 'TRANSFER'
      AND il."referenceId" = st."id"
      AND il."movementType" = 'TRANSFER_OUT'
  );
