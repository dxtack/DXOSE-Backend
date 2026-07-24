-- Add explicit Finance approval gate (must commit before UPDATE — see next migration).
ALTER TYPE "GrnStatus" ADD VALUE IF NOT EXISTS 'PENDING_FINANCE';
