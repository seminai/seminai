-- AlterEnum
ALTER TYPE "EmailIngestionStatus" ADD VALUE 'IGNORED_OPT_OUT';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "emailIngestionEnabled" BOOLEAN NOT NULL DEFAULT false;
