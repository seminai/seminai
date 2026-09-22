-- CreateTable
CREATE TABLE "LabelHistory" (
    "id" TEXT NOT NULL,
    "labelExtractionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "previousSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabelHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabelHistory_labelExtractionId_idx" ON "LabelHistory"("labelExtractionId");

-- CreateIndex
CREATE INDEX "LabelHistory_userId_idx" ON "LabelHistory"("userId");

-- AddForeignKey
ALTER TABLE "LabelHistory" ADD CONSTRAINT "LabelHistory_labelExtractionId_fkey" FOREIGN KEY ("labelExtractionId") REFERENCES "LabelExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelHistory" ADD CONSTRAINT "LabelHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
