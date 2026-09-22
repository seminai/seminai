import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentGetCropIdentification(this: ProductionUnitCsvAgentContext, cropName: string, variety: string | null): {
    cropName: string | null;
    cropType: string | null;
    code: string | null;
    variety: string | null;
  } {
    const cacheKey = this.buildCropCacheKey(cropName, variety);
    const cached = this.cropCache.get(cacheKey);
    if (cached) {
      return {
        cropName: cached.species,
        cropType: cached.cropType,
        code: cached.code,
        variety: cached.variety,
      };
    }
    // Fallback if not in cache (shouldn't happen after batch identification)
    return { cropName: null, cropType: cropName, code: null, variety };
  }
