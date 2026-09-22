-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "whatsappApiKey" TEXT,
ADD COLUMN     "whatsappConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappInstanceId" TEXT,
ADD COLUMN     "whatsappInstanceName" TEXT,
ADD COLUMN     "whatsappLastSync" TIMESTAMP(3),
ADD COLUMN     "whatsappPhoneNumber" TEXT,
ADD COLUMN     "whatsappQrCode" TEXT;

-- CreateIndex
CREATE INDEX "Settings_userId_idx" ON "Settings"("userId");

-- CreateIndex
CREATE INDEX "Settings_whatsappInstanceName_idx" ON "Settings"("whatsappInstanceName");
