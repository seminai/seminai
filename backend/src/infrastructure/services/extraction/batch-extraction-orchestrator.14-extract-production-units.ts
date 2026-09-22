import { type ProductionUnitsExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { ProductionUnitCsvAgent } from '../agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../agents/file_agent/piano_colturale_pdf_agent';
import { MulterFileInput } from './batch-extraction-orchestrator.support';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorExtractProductionUnits(this: BatchExtractionOrchestratorContext, file: MulterFileInput, fileFormat: string, companyId: string, onProgress: (progress: number) => void): Promise<ProductionUnitsExtractionData> {
    if (fileFormat === 'pdf') {
      const pdfAgent = new PianoColturalePdfAgent();
      const result = await pdfAgent.extractFromPdf(file.buffer, (completed, total) => {
        onProgress(10 + Math.round(((completed + 1) / total) * 80));
      });
      const previews = await this.buildPuPreviews(result.productionUnits.units, companyId);
      return {
        productionUnits: previews,
        extractedCount: previews.length,
        diagnostics: result.productionUnits.diagnostics,
      };
    }
    const csvAgent = new ProductionUnitCsvAgent();
    const result = await csvAgent.extractProductionUnitsFromCsv(file.buffer);
    onProgress(70);
    const previews = await this.buildPuPreviews(result.units, companyId);
    return {
      productionUnits: previews,
      extractedCount: previews.length,
      diagnostics: result.diagnostics,
    };
  }
