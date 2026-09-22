import { type ProductionUnitPreview } from '../../../domain/dtos/file-extraction.dto';
import { type ProductionUnitRaw } from '../agents/production_unit/production_unit_csv_agent';
import { buildFieldIndex, buildProductionUnitPreview, getCropCatalog } from './production-unit-normalizer';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorBuildPuPreviews(this: BatchExtractionOrchestratorContext, rawUnits: ProductionUnitRaw[], companyId: string): Promise<ProductionUnitPreview[]> {
    const companyFields = await this.fieldRepository.findManyByCompanyId(companyId);
    const fieldIdx = buildFieldIndex(companyFields);
    const cropCatalog = getCropCatalog();
    return rawUnits.map(
      (unit) =>
        buildProductionUnitPreview(
          unit,
          companyId,
          fieldIdx,
          cropCatalog,
        ) as unknown as ProductionUnitPreview,
    );
  }
