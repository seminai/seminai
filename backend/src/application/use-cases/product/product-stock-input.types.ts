import type { ProductCategory } from '@prisma/client';

export interface ProductStockInput {
  readonly sourceFileId?: string;
  readonly sourceExtractionId?: string;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly price?: number;
  readonly unitOfMeasurePrice?: string;
  readonly type?: string;
  readonly ddtCode?: string;
  readonly ddtDate?: string | Date;
  readonly ddtUrlFile?: string;
  readonly invoiceCode?: string;
  readonly invoiceDate?: string | Date;
  readonly invoiceDueDate?: string | Date;
  readonly invoiceUrlFile?: string;
  readonly companySupplierName?: string;
  readonly addressSupplier?: string;
  readonly vatNumberSupplier?: string;
  readonly productNameAsOnDocument?: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
}

export interface ProductWithStockInput {
  readonly id?: string;
  readonly name: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly category?: ProductCategory | string;
  readonly type?: string;
  readonly description?: string;
  readonly registrationNumber?: string;
  readonly labelUrl?: string;
  readonly labelMetadata?: unknown;
  readonly stock?: ProductStockInput;
}

export interface CreateOrUpdateProductsAndStocksBulkDTO {
  readonly companyId: string;
  readonly warehouseId?: string;
  readonly products: ProductWithStockInput[];
}

export interface CreateOrUpdateResult {
  productsCreated: number;
  productsUpdated: number;
  stocksCreated: number;
  errors: string[];
  productIds: string[];
}
