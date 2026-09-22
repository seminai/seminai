-- CreateTable
CREATE TABLE "DisciplinariExtraction" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "region" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "version" TEXT,
    "title" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "rawText" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "extractionConfidence" INTEGER NOT NULL DEFAULT 0,
    "extractionErrors" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinariExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisciplinariExtraction_fileHash_key" ON "DisciplinariExtraction"("fileHash");

-- CreateIndex
CREATE INDEX "DisciplinariExtraction_region_idx" ON "DisciplinariExtraction"("region");

-- CreateIndex
CREATE INDEX "DisciplinariExtraction_year_idx" ON "DisciplinariExtraction"("year");

-- CreateIndex
CREATE INDEX "DisciplinariExtraction_validUntil_idx" ON "DisciplinariExtraction"("validUntil");

-- CreateIndex
CREATE INDEX "DisciplinariExtraction_isExpired_idx" ON "DisciplinariExtraction"("isExpired");

-- CreateIndex
CREATE INDEX "DisciplinariExtraction_fileHash_idx" ON "DisciplinariExtraction"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplinariExtraction_region_year_title_key" ON "DisciplinariExtraction"("region", "year", "title");
