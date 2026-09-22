-- CreateEnum
CREATE TYPE "FileExtractionStatus" AS ENUM ('LOADING', 'PENDING_CONFIRMATION', 'CONFIRMED', 'ERROR');

-- CreateTable
CREATE TABLE "FileExtraction" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "FileExtractionStatus" NOT NULL DEFAULT 'LOADING',
    "category" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "extractedData" JSONB,
    "error" TEXT,
    "fileName" TEXT NOT NULL,
    "fileIndex" INTEGER NOT NULL,
    "fileId" TEXT,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileExtraction_batchId_idx" ON "FileExtraction"("batchId");

-- CreateIndex
CREATE INDEX "FileExtraction_companyId_idx" ON "FileExtraction"("companyId");

-- CreateIndex
CREATE INDEX "FileExtraction_userId_idx" ON "FileExtraction"("userId");

-- CreateIndex
CREATE INDEX "FileExtraction_fileId_idx" ON "FileExtraction"("fileId");

-- AddForeignKey
ALTER TABLE "FileExtraction" ADD CONSTRAINT "FileExtraction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileExtraction" ADD CONSTRAINT "FileExtraction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileExtraction" ADD CONSTRAINT "FileExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
