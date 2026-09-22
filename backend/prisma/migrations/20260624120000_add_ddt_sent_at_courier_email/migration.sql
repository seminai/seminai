-- AlterTable
ALTER TABLE "DeliveryNote" ADD COLUMN "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "courierEmail" TEXT;
