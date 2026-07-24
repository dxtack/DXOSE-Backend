-- AlterTable
ALTER TABLE "movement_lines" ADD COLUMN IF NOT EXISTS "photoKey" TEXT;
ALTER TABLE "movement_lines" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
