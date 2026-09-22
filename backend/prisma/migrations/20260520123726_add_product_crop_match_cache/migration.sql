-- CreateTable
CREATE TABLE "ProductCropMatchCache" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "cropNameNorm" TEXT NOT NULL,
    "varietyNorm" TEXT NOT NULL DEFAULT '',
    "isCompatible" BOOLEAN NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "matchedCrops" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCropMatchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pcm_reg_crop_var_uq" ON "ProductCropMatchCache"("registrationNumber", "cropNameNorm", "varietyNorm");

-- CreateIndex
CREATE INDEX "ProductCropMatchCache_registrationNumber_idx" ON "ProductCropMatchCache"("registrationNumber");

-- CreateIndex
CREATE INDEX "ProductCropMatchCache_updatedAt_idx" ON "ProductCropMatchCache"("updatedAt");
