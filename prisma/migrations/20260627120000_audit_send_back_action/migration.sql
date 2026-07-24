-- Ch.22.2 — Send Back workflow action audit record
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SEND_BACK';
