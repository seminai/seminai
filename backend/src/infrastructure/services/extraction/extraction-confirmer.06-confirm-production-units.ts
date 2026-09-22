import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { type ProductionUnitsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirmProductionUnits(this: ExtractionConfirmerContext, extraction: FileExtractionRecord, data: ProductionUnitsExtractionData): Promise<Record<string, unknown>> {
    const company = await this.resolveCompanyInfo(extraction.companyId);
    const dto: BulkImportDTO = {
      userId: extraction.userId,
      companyName: company.name,
      vatNumber: company.vatNumber,
      fields: [],
      productionUnits: this.mapPuPreviews(
        data.productionUnits as unknown as Record<string, unknown>[],
      ),
    };
    const result = await this.bulkImportUseCase.execute(dto);
    return { productionUnitsCreated: result.productionUnitCount };
  }
