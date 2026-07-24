-- Add Inventory Count workflow states to MovementStatus enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'MovementStatus' AND e.enumlabel = 'COUNTING'
  ) THEN
    ALTER TYPE "MovementStatus" ADD VALUE 'COUNTING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'MovementStatus' AND e.enumlabel = 'REVEAL_REVIEW'
  ) THEN
    ALTER TYPE "MovementStatus" ADD VALUE 'REVEAL_REVIEW';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'MovementStatus' AND e.enumlabel = 'RECOUNTING'
  ) THEN
    ALTER TYPE "MovementStatus" ADD VALUE 'RECOUNTING';
  END IF;
END $$;

