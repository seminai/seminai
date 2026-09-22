-- AlterEnum
ALTER TYPE "ChatCategory" ADD VALUE 'FIELD_NOTES';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 0;
