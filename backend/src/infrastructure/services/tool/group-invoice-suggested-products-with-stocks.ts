import {
  parseProductName,
  convertPiecesToRealUnit,
  isPiecesUnit,
  resolveOfficialName,
} from '../utils/ProductNameParser';
import { convertQuantityToCanonicalUnit } from '../../utils/quantityConversion';

export interface InvoiceSuggestedProduct {
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly productCategory: string;
  readonly administrativeStatus: string | null;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly productNameExtracted?: string | null;
  readonly quantityConverted?: number | null;
  readonly unitMeasureConverted?: string | null;
  readonly quantityExtractedInProductName?: number | null;
  readonly quantityExtractedInProductNameUnit?: string | null;
  readonly supplierName: string | null;
  readonly supplierVat: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly invoiceDueDate: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
}

export interface InvoiceSuggestedProductWithStocks {
  readonly product: {
    readonly productName: string;
    readonly registrationNumber: string | null;
    readonly productCategory: string;
    readonly administrativeStatus: string | null;
    readonly productNameExtracted: string | null;
  };
  readonly stocks: ReadonlyArray<{
    readonly quantity: number | null;
    readonly quantityUnitOfMeasure: string | null;
    readonly quantityConverted: number | null;
    readonly unitMeasureConverted: string | null;
    readonly quantityExtractedInProductName: number | null;
    readonly quantityExtractedInProductNameUnit: string | null;
    readonly supplierName: string | null;
    readonly supplierVat: string | null;
    readonly invoiceNumber: string | null;
    readonly invoiceDate: string | null;
    readonly invoiceDueDate: string | null;
    readonly unitPrice: number | null;
    readonly totalPrice: number | null;
    readonly notes: string | null;
    readonly packagingInfo: string | null;
  }>;
}

export class GroupInvoiceSuggestedProductsWithStocksService {
  public execute(params: {
    products: ReadonlyArray<InvoiceSuggestedProduct>;
  }): ReadonlyArray<InvoiceSuggestedProductWithStocks> {
    const grouped = new Map<
      string,
      {
        product: InvoiceSuggestedProductWithStocks['product'];
        stocks: Array<InvoiceSuggestedProductWithStocks['stocks'][number]>;
      }
    >();

    params.products.forEach((item) => {
      const parsed = parseProductName(item.productName);
      const key = this.buildGroupingKey(parsed.baseName, item.supplierVat);
      const existing = grouped.get(key);

      let stockQuantity = item.quantity;
      let stockUnit = item.quantityUnitOfMeasure;
      let stockPackagingInfo = parsed.packagingInfo;

      if (stockQuantity !== null && stockUnit && isPiecesUnit(stockUnit)) {
        const conversion = convertPiecesToRealUnit(stockQuantity, stockUnit, item.productName);
        if (conversion.converted) {
          stockQuantity = conversion.quantity;
          stockUnit = conversion.unitOfMeasure;
          stockPackagingInfo = conversion.packagingInfo;
        }
      }

      const canonicalConversion = convertQuantityToCanonicalUnit(stockQuantity, stockUnit);

      const stock = {
        quantity: stockQuantity,
        quantityUnitOfMeasure: stockUnit,
        quantityConverted: canonicalConversion?.quantityConverted ?? stockQuantity ?? null,
        unitMeasureConverted: canonicalConversion?.unitMeasureConverted ?? stockUnit ?? null,
        quantityExtractedInProductName: parsed.packagingQuantity,
        quantityExtractedInProductNameUnit: parsed.packagingUnit,
        supplierName: item.supplierName,
        supplierVat: item.supplierVat,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        invoiceDueDate: item.invoiceDueDate,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: parsed.baseName !== item.productName.trim() ? item.productName.trim() : null,
        packagingInfo: stockPackagingInfo,
      };

      if (existing) {
        existing.stocks.push(stock);
        return;
      }

      const officialName = resolveOfficialName(parsed.baseName);

      grouped.set(key, {
        product: {
          productName: officialName,
          registrationNumber: item.registrationNumber,
          productCategory: item.productCategory,
          administrativeStatus: item.administrativeStatus,
          productNameExtracted: item.productNameExtracted ?? null,
        },
        stocks: [stock],
      });
    });

    return Array.from(grouped.values()).map((value) => ({
      product: value.product,
      stocks: value.stocks,
    }));
  }

  private buildGroupingKey(baseName: string, supplierVat: string | null): string {
    return [baseName.trim().toLowerCase(), (supplierVat ?? '').trim().toLowerCase()].join('|');
  }
}
