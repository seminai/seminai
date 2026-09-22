-- CreateEnum
CREATE TYPE "EmailIngestionStatus" AS ENUM ('RECEIVED', 'AWAITING_DISAMBIGUATION', 'DISPATCHED', 'FAILED', 'IGNORED_UNKNOWN_SENDER', 'IGNORED_DUPLICATE', 'IGNORED_NO_ATTACHMENTS');

-- CreateTable
CREATE TABLE "EmailIngestion" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "EmailIngestionStatus" NOT NULL DEFAULT 'RECEIVED',
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "rawHeaders" JSONB,
    "errorMessage" TEXT,
    "threadId" TEXT,
    "userId" TEXT,
    "companyId" TEXT,
    "parentIngestionId" TEXT,
    "disambiguationToken" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailIngestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "ingestionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "gcsUrl" TEXT NOT NULL,
    "gcsPath" TEXT NOT NULL,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngestion_messageId_key" ON "EmailIngestion"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailIngestion_disambiguationToken_key" ON "EmailIngestion"("disambiguationToken");

-- CreateIndex
CREATE INDEX "EmailIngestion_fromAddress_status_idx" ON "EmailIngestion"("fromAddress", "status");

-- CreateIndex
CREATE INDEX "EmailIngestion_userId_status_idx" ON "EmailIngestion"("userId", "status");

-- CreateIndex
CREATE INDEX "EmailAttachment_ingestionId_idx" ON "EmailAttachment"("ingestionId");

-- AddForeignKey
ALTER TABLE "EmailIngestion" ADD CONSTRAINT "EmailIngestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailIngestion" ADD CONSTRAINT "EmailIngestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailIngestion" ADD CONSTRAINT "EmailIngestion_parentIngestionId_fkey" FOREIGN KEY ("parentIngestionId") REFERENCES "EmailIngestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "EmailIngestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;
