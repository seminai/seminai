export interface CsvExcelRow {
  readonly productName: string;
  readonly sku?: string;
  readonly registrationNumber?: string;
  readonly category?: string;
  readonly supplierName?: string;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly price?: number;
  readonly unitOfMeasurePrice?: string;
  readonly type?: 'IN' | 'OUT';
  readonly ddtCode: string;
  readonly ddtDate: string;
  readonly invoiceCode?: string;
  readonly invoiceDate?: string;
  readonly invoiceDueDate?: string;
}

export interface ImportProductsFromCsvExcelDTO {
  readonly companyId: string;
  readonly warehouseId?: string;
  readonly sourceFileId?: string;
  readonly fileBuffer: Buffer;
  readonly fileName: string;
  readonly preview?: boolean;
}

export interface ProductImportPreview {
  readonly name: string;
  readonly sku?: string;
  readonly barcode: string | null;
  readonly category: string;
  readonly type: string;
  readonly description: string | null;
  readonly registrationNumber: string | null;
  readonly stock: {
    readonly quantity: number;
    readonly unitOfMeasureQuantity: string;
    readonly price: number;
    readonly unitOfMeasurePrice: string;
    readonly type: 'IN' | 'OUT';
    readonly ddtCode: string;
    readonly ddtDate: string;
    readonly invoiceCode: string | null;
    readonly invoiceDate: string | null;
    readonly invoiceDueDate: string | null;
    readonly companySupplierName: string | null;
    readonly addressSupplier: string | null;
    readonly vatNumberSupplier: string | null;
  };
}

export interface ImportResult {
  productsCreated: number;
  productsUpdated: number;
  stocksCreated: number;
  errors: string[];
  productIds: string[];
  previewProducts?: ProductImportPreview[];
}

export interface ColumnIndexMapping {
  readonly productNameIdx: number;
  readonly skuIdx: number;
  readonly registrationNumberIdx: number;
  readonly categoryIdx: number;
  readonly supplierNameIdx: number;
  readonly quantityIdx: number;
  readonly unitOfMeasureQuantityIdx: number;
  readonly priceIdx: number;
  readonly unitOfMeasurePriceIdx: number;
  readonly typeIdx: number;
  readonly ddtCodeIdx: number;
  readonly ddtDateIdx: number;
  readonly invoiceCodeIdx: number;
  readonly invoiceDateIdx: number;
  readonly invoiceDueDateIdx: number;
  readonly initialStockQuantityIdx: number;
}
