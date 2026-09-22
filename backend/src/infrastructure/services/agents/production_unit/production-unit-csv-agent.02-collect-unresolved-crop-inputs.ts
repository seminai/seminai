import { getCropCatalog } from '../../extraction/production-unit-normalizer';
import { isUnresolvedCropName } from '../../extraction/crop-catalog-resolver';
import { CropIdentificationInput, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentCollectUnresolvedCropInputs(this: ProductionUnitCsvAgentContext, aggregated: Map<string, ProductionUnitRaw>): CropIdentificationInput[] {
    if (!this.cropCatalogCache) {
      this.cropCatalogCache = getCropCatalog();
    }
    const catalog = this.cropCatalogCache;
    const seen = new Set<string>();
    const inputs: CropIdentificationInput[] = [];
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.cropName || !isUnresolvedCropName(cycle.cropName, catalog)) continue;
        const cacheKey = this.buildCropCacheKey(cycle.cropName, cycle.variety);
        const cached = this.cropCache.get(cacheKey);
        if (cached?.species) continue;
        if (seen.has(cacheKey)) continue;
        seen.add(cacheKey);
        inputs.push({ cropName: cycle.cropName, variety: cycle.variety });
      }
    }
    return inputs;
  }
