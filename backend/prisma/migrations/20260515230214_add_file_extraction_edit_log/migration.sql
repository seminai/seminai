-- CreateEnum
CREATE TYPE "FileExtractionEditSource" AS ENUM ('LLM_INITIAL', 'USER_EDIT', 'CONFIRM_OVERRIDE');

-- CreateTable
CREATE TABLE "FileExtractionEditLog" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "FileExtractionEditSource" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileExtractionEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileExtractionEditLog_extractionId_createdAt_idx" ON "FileExtractionEditLog"("extractionId", "createdAt");

-- CreateIndex
CREATE INDEX "FileExtractionEditLog_source_createdAt_idx" ON "FileExtractionEditLog"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FileExtractionEditLog_extractionId_version_key" ON "FileExtractionEditLog"("extractionId", "version");

-- AddForeignKey
ALTER TABLE "FileExtractionEditLog" ADD CONSTRAINT "FileExtractionEditLog_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "FileExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
