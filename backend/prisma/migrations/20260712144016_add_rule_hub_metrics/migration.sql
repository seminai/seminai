-- AlterTable
ALTER TABLE "Rule" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Rule_isPublic_status_idx" ON "Rule"("isPublic", "status");
