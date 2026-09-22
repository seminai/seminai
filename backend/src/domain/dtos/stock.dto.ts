/**
 * DTO used to create Stock domain entities.
 */
export interface CreateStockProps {
  productId: string;
  sourceFileId?: string | null;
  sourceExtractionId?: string | null;
  quantity: number;
  unitOfMeasureQuantity: string;
  price?: number;
  unitOfMeasurePrice?: string;
  type: string;
  ddtCode?: string | null;
  ddtDate?: Date | null;
  ddtUrlFile?: string | null;
  invoiceCode?: string | null;
  invoiceDate?: Date | null;
  invoiceDueDate?: Date | null;
  invoiceUrlFile?: string | null;
  companySupplierName?: string | null;
  addressSupplier?: string | null;
  vatNumberSupplier?: string | null;
  notes?: string | null;
  packagingInfo?: string | null;
  productNameAsOnDocument?: string | null;
  quantityConverted?: number | null;
  unitMeasureConverted?: string | null;
  jobId?: string | null;
  deliveryNoteId?: string | null;
}

/**
 * DTO used to update Stock domain entities.
 * All fields are optional as partial updates are allowed.
 */
export interface UpdateStockProps {
  productId?: string;
  sourceFileId?: string | null;
  sourceExtractionId?: string | null;
  quantity?: number;
  unitOfMeasureQuantity?: string;
  price?: number;
  unitOfMeasurePrice?: string;
  type?: string;
  ddtCode?: string | null;
  ddtDate?: Date | null;
  ddtUrlFile?: string | null;
  invoiceCode?: string | null;
  invoiceDate?: Date | null;
  invoiceDueDate?: Date | null;
  invoiceUrlFile?: string | null;
  companySupplierName?: string | null;
  addressSupplier?: string | null;
  vatNumberSupplier?: string | null;
  notes?: string | null;
  packagingInfo?: string | null;
  productNameAsOnDocument?: string | null;
  quantityConverted?: number | null;
  unitMeasureConverted?: string | null;
  jobId?: string | null;
}
