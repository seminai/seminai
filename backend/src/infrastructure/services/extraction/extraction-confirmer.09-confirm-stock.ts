import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type ProductWithStockInput } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirmStock(this: ExtractionConfirmerContext, extraction: FileExtractionRecord, data: StockExtractionData): Promise<Record<string, unknown>> {
    const products: ProductWithStockInput[] = data.entries.map((entry) => ({
      name: entry.name,
      category: entry.category as 'FERTILIZER' | 'PESTICIDE' | 'SEED' | 'HARVEST',
      registrationNumber: entry.registrationNumber ?? undefined,
      stock: {
        sourceFileId: extraction.fileId ?? undefined,
        sourceExtractionId: extraction.id,
        quantity: entry.stock.quantity,
        unitOfMeasureQuantity: entry.stock.unitOfMeasureQuantity,
        price: entry.stock.price,
        type: entry.stock.type,
        ddtCode: entry.stock.ddtCode,
        ddtDate: entry.stock.ddtDate,
        invoiceCode: entry.stock.invoiceCode ?? undefined,
        companySupplierName: entry.stock.companySupplierName ?? undefined,
      },
    }));
    const result = await this.productStockUseCase.execute({
      companyId: extraction.companyId,
      products,
    });
    return {
      productsCreated: result.productsCreated,
      stocksCreated: result.stocksCreated,
    };
  }
