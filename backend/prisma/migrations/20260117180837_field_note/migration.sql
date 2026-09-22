-- CreateEnum
CREATE TYPE "FieldNoteCategory" AS ENUM ('OPERATION', 'OBSERVATION', 'MEASUREMENT', 'HARVEST', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "FieldNoteProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'MANUALLY_REVIEWED');

-- CreateTable
CREATE TABLE "FieldNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "FieldNoteCategory" NOT NULL,
    "status" "FieldNoteProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "rawContent" TEXT NOT NULL,
    "extractedData" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "operationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fieldId" TEXT,
    "productionUnitId" TEXT,
    "productId" TEXT,
    "jobId" TEXT,
    "metadata" JSONB,
    "aiConfidenceScore" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldNoteAttachment" (
    "id" TEXT NOT NULL,
    "fieldNoteId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "metadata" JSONB,
    "aiAnalysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldNoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FieldNote_jobId_key" ON "FieldNote"("jobId");

-- CreateIndex
CREATE INDEX "FieldNote_userId_idx" ON "FieldNote"("userId");

-- CreateIndex
CREATE INDEX "FieldNote_category_idx" ON "FieldNote"("category");

-- CreateIndex
CREATE INDEX "FieldNote_status_idx" ON "FieldNote"("status");

-- CreateIndex
CREATE INDEX "FieldNote_operationDate_idx" ON "FieldNote"("operationDate");

-- CreateIndex
CREATE INDEX "FieldNote_fieldId_idx" ON "FieldNote"("fieldId");

-- CreateIndex
CREATE INDEX "FieldNote_productionUnitId_idx" ON "FieldNote"("productionUnitId");

-- CreateIndex
CREATE INDEX "FieldNote_productId_idx" ON "FieldNote"("productId");

-- CreateIndex
CREATE INDEX "FieldNote_latitude_longitude_idx" ON "FieldNote"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "FieldNoteAttachment_fieldNoteId_idx" ON "FieldNoteAttachment"("fieldNoteId");

-- AddForeignKey
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_productionUnitId_fkey" FOREIGN KEY ("productionUnitId") REFERENCES "ProductionUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldNote" ADD CONSTRAINT "FieldNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldNoteAttachment" ADD CONSTRAINT "FieldNoteAttachment_fieldNoteId_fkey" FOREIGN KEY ("fieldNoteId") REFERENCES "FieldNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
