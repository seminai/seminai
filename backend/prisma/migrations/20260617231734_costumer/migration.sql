-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('GENERATED', 'SENT', 'CANCELLED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "unitOfMeasure" TEXT,
ADD COLUMN     "unitPrice" DOUBLE PRECISION,
ADD COLUMN     "vatRate" DOUBLE PRECISION,
ADD COLUMN     "vintage" INTEGER;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "deliveryNoteId" TEXT;

-- CreateTable
CREATE TABLE "BusinessPartner" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "vatNumber" TEXT,
    "fiscalCode" TEXT,
    "sdiCode" TEXT,
    "pec" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "referent" TEXT,
    "nation" TEXT,
    "city" TEXT,
    "address" TEXT,
    "cap" TEXT,
    "deliveryAddress" TEXT,
    "deliveryCity" TEXT,
    "deliveryCap" TEXT,
    "deliveryNation" TEXT,
    "deliveryNotesText" TEXT,
    "deliveryHours" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "internalNotes" TEXT,
    "deliveryNotesText" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderId" TEXT,
    "number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "ddtDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'GENERATED',
    "causale" TEXT,
    "carrier" TEXT,
    "packagesCount" INTEGER,
    "estimatedWeightKg" DOUBLE PRECISION,
    "deliveryNotesText" TEXT,
    "customerSnapshot" JSONB NOT NULL,
    "htmlUrl" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteItem" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "vintage" INTEGER,
    "unitOfMeasure" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessPartner_companyId_type_idx" ON "BusinessPartner"("companyId", "type");

-- CreateIndex
CREATE INDEX "BusinessPartner_companyId_vatNumber_idx" ON "BusinessPartner"("companyId", "vatNumber");

-- CreateIndex
CREATE INDEX "BusinessPartner_companyId_email_idx" ON "BusinessPartner"("companyId", "email");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_status_idx" ON "SalesOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "SalesOrder_partnerId_idx" ON "SalesOrder"("partnerId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_orderId_idx" ON "SalesOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE INDEX "DeliveryNote_companyId_status_idx" ON "DeliveryNote"("companyId", "status");

-- CreateIndex
CREATE INDEX "DeliveryNote_partnerId_idx" ON "DeliveryNote"("partnerId");

-- CreateIndex
CREATE INDEX "DeliveryNote_orderId_idx" ON "DeliveryNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_companyId_year_number_key" ON "DeliveryNote"("companyId", "year", "number");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_deliveryNoteId_idx" ON "DeliveryNoteItem"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteItem_productId_idx" ON "DeliveryNoteItem"("productId");

-- CreateIndex
CREATE INDEX "Stock_deliveryNoteId_idx" ON "Stock"("deliveryNoteId");

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "BusinessPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteItem" ADD CONSTRAINT "DeliveryNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
