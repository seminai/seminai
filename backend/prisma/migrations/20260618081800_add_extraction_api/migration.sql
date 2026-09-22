-- AlterEnum
ALTER TYPE "LlmJobType" ADD VALUE 'DOCUMENT_EXTRACTION';

-- CreateTable
CREATE TABLE "ExtractionApiAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageQuota" INTEGER NOT NULL DEFAULT 0,
    "pagesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionApiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionApiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "documentType" TEXT NOT NULL,
    "detectedType" TEXT,
    "fileName" TEXT,
    "pagesProcessed" INTEGER NOT NULL,
    "pagesCharged" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionApiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionApiAccount_userId_key" ON "ExtractionApiAccount"("userId");

-- CreateIndex
CREATE INDEX "ExtractionApiAccount_userId_idx" ON "ExtractionApiAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionApiKey_keyHash_key" ON "ExtractionApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ExtractionApiKey_userId_idx" ON "ExtractionApiKey"("userId");

-- CreateIndex
CREATE INDEX "ExtractionApiKey_keyHash_idx" ON "ExtractionApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ExtractionApiUsageLog_userId_createdAt_idx" ON "ExtractionApiUsageLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExtractionApiAccount" ADD CONSTRAINT "ExtractionApiAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionApiKey" ADD CONSTRAINT "ExtractionApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionApiUsageLog" ADD CONSTRAINT "ExtractionApiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
