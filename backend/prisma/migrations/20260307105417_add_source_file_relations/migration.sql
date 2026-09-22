-- AlterTable
ALTER TABLE "Field" ADD COLUMN     "sourceFileId" TEXT;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "sourceFileId" TEXT;

-- CreateIndex
CREATE INDEX "Field_sourceFileId_idx" ON "Field"("sourceFileId");

-- CreateIndex
CREATE INDEX "Stock_sourceFileId_idx" ON "Stock"("sourceFileId");

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
