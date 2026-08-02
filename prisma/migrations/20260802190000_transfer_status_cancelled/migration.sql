-- Creator cancel of returned transfers is a distinct terminal status.
ALTER TYPE "TransferStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
