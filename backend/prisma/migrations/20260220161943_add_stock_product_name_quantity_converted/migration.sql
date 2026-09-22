-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "productNameAsOnDocument" TEXT,
ADD COLUMN     "quantityConverted" DOUBLE PRECISION,
ADD COLUMN     "unitMeasureConverted" TEXT;
