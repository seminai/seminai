-- AlterTable
ALTER TABLE "BusinessPartner" ADD COLUMN "followUpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessPartner" ADD COLUMN "followUpLastSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BusinessPartner_followUpEnabled_followUpLastSentAt_idx" ON "BusinessPartner"("followUpEnabled", "followUpLastSentAt");
