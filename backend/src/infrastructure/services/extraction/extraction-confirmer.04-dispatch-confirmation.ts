import { AppError } from '../../../domain/errors/AppError';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type FieldsExtractionData, type ProductionUnitsExtractionData, type AgriculturalExtractionData, type InvoiceExtractionData, type StockExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerDispatchConfirmation(this: ExtractionConfirmerContext, extraction: FileExtractionRecord, requestData?: ConfirmExtractionRequestDTO): Promise<Record<string, unknown>> {
    const category = extraction.category;
    const data = extraction.extractedData;
    switch (category) {
      case 'fields':
        return this.confirmFields(extraction, data as FieldsExtractionData);
      case 'production_units':
        return this.confirmProductionUnits(extraction, data as ProductionUnitsExtractionData);
      case 'agricultural':
        return this.confirmAgricultural(extraction, data as AgriculturalExtractionData);
      case 'invoice':
      case 'ddt':
        return this.confirmInvoice(extraction, data as InvoiceExtractionData, requestData);
      case 'stock':
        return this.confirmStock(extraction, data as StockExtractionData);
      default:
        throw AppError.badRequest(`Unknown category: ${category}`, 'UNKNOWN_CATEGORY');
    }
  }
