ALTER TABLE "Stock" ADD COLUMN "sourceExtractionId" TEXT;

CREATE INDEX "Stock_sourceExtractionId_idx" ON "Stock"("sourceExtractionId");

ALTER TABLE "Stock"
ADD CONSTRAINT "Stock_sourceExtractionId_fkey"
FOREIGN KEY ("sourceExtractionId") REFERENCES "FileExtraction"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
