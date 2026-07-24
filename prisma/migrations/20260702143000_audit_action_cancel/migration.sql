-- Inventory Count v3: CANCEL audit action for session cancel lifecycle (distinct from VOID).

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANCEL';
