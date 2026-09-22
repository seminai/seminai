-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LlmJobType" ADD VALUE 'FIELD_NOTE';
ALTER TYPE "LlmJobType" ADD VALUE 'AUDIO_TRANSCRIPTION';
ALTER TYPE "LlmJobType" ADD VALUE 'CHAT_DOSAGE';
ALTER TYPE "LlmJobType" ADD VALUE 'JOB_VERIFICATION';
ALTER TYPE "LlmJobType" ADD VALUE 'CONFORMITY_CHECK';
ALTER TYPE "LlmJobType" ADD VALUE 'CSV_IMPORT';
