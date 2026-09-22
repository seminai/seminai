-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "whatsappAllowedNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];
