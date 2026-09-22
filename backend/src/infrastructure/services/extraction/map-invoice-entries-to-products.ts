import { CompanyKind } from '@prisma/client';
import { type ProductWithStockInput } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { resolveExtractionProductCategory } from '../../../application/use-cases/extraction/resolve-extraction-product-category';
import { type ConfirmableStockEntry } from '../../../domain/dtos/extraction-confirm-request.dto';
import { type DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { type InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';

interface MapInvoiceEntriesToProductsOptions {
  readonly entries: readonly ConfirmableStockEntry[];
  readonly fileId: string | null;
  readonly extractionId: string;
  readonly isDdtCategory: boolean;
  readonly companyKind?: CompanyKind;
}

type LegacyDdtEntry = DdtEntry & {
  readonly invoiceNumber?: string | null;
  readonly invoiceDate?: string | null;
};

export function mapInvoiceEntriesToProducts({
  entries,
  fileId,
  extractionId,
  isDdtCategory,
  companyKind = CompanyKind.AGRICULTURAL,
}: MapInvoiceEntriesToProductsOptions): ProductWithStockInput[] {
  return entries.map((entry) => {
    const invoiceEntry = entry as InvoiceEntry;
    const ddtFields = resolveDdtStockFields(entry, isDdtCategory);
    const resolved = resolveExtractionProductCategory(
      entry.productCategory,
      companyKind,
      entry.registrationNumber,
    );
    return {
      name: entry.productName,
      category: resolved.category,
      type: resolved.type,
      registrationNumber: entry.registrationNumber ?? undefined,
      stock: {
        sourceFileId: fileId ?? undefined,
        sourceExtractionId: extractionId,
        quantity: entry.quantity ?? Number.NaN,
        unitOfMeasureQuantity: entry.quantityUnitOfMeasure ?? '',
        price: entry.totalPrice ?? undefined,
        type: 'IN' as const,
        invoiceCode: isDdtCategory ? undefined : invoiceEntry.invoiceNumber ?? undefined,
        invoiceDate: isDdtCategory ? undefined : invoiceEntry.invoiceDate ?? undefined,
        companySupplierName: entry.supplierName ?? undefined,
        vatNumberSupplier: entry.supplierVat ?? undefined,
        ddtCode: ddtFields.ddtCode,
        ddtDate: ddtFields.ddtDate,
        quantityConverted: entry.quantityConverted ?? null,
        unitMeasureConverted: entry.unitMeasureConverted ?? null,
      },
    };
  });
}

function resolveDdtStockFields(
  entry: ConfirmableStockEntry,
  isDdtCategory: boolean,
): { readonly ddtCode: string | undefined; readonly ddtDate: string | undefined } {
  if (!isDdtCategory) {
    return { ddtCode: undefined, ddtDate: undefined };
  }
  const ddtEntry = entry as LegacyDdtEntry;
  return {
    ddtCode: ddtEntry.orderNumber ?? ddtEntry.invoiceNumber ?? undefined,
    ddtDate: ddtEntry.ddtDate ?? ddtEntry.invoiceDate ?? undefined,
  };
}
