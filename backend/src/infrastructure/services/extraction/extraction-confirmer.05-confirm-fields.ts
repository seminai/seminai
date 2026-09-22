import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';
import { type BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { type FieldsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export async function extractionConfirmerConfirmFields(this: ExtractionConfirmerContext, extraction: FileExtractionRecord, data: FieldsExtractionData): Promise<Record<string, unknown>> {
    const company = await this.resolveCompanyInfo(extraction.companyId);
    const dto: BulkImportDTO = {
      userId: extraction.userId,
      companyName: company.name,
      vatNumber: company.vatNumber,
      fields: this.mapFieldPreviews(data.fields as unknown as Record<string, unknown>[]),
      productionUnits: [],
    };
    const result = await this.bulkImportUseCase.execute(dto);
    return { fieldsCreated: result.fieldCount };
  }
