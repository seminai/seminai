-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "isVectorized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pdfFileHash" TEXT,
ADD COLUMN     "pdfFileName" TEXT,
ADD COLUMN     "pdfFileUrl" TEXT,
ADD COLUMN     "qdrantCollection" TEXT,
ADD COLUMN     "vectorizationError" TEXT,
ADD COLUMN     "vectorizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Rule_pdfFileHash_idx" ON "Rule"("pdfFileHash");

-- CreateIndex
CREATE INDEX "Rule_isVectorized_idx" ON "Rule"("isVectorized");
