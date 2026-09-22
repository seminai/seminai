import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentBuildCropCacheKey(this: ProductionUnitCsvAgentContext, cropName: string, variety: string | null): string {
    const cropNorm = this.normalizeString(cropName);
    const varietyNorm = variety ? this.normalizeString(variety) : '';
    return `${cropNorm}|${varietyNorm}`;
  }
