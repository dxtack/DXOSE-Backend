-- ACC Big Bang Stage S4B — Role.code UserRole enum → String (data-preserving)

-- AlterTable: preserve existing enum values as text
ALTER TABLE "roles" ALTER COLUMN "code" SET DATA TYPE TEXT USING "code"::text;

-- DropEnum
DROP TYPE "UserRole";
