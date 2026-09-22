-- CreateTable
CREATE TABLE "BdfCache" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "params" JSONB,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BdfCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BdfCache_endpoint_idx" ON "BdfCache"("endpoint");

-- CreateIndex
CREATE INDEX "BdfCache_updatedAt_idx" ON "BdfCache"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BdfCache_endpoint_cacheKey_key" ON "BdfCache"("endpoint", "cacheKey");
