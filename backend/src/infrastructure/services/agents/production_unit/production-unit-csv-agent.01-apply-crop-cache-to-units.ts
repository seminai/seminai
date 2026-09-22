import { ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export function productionUnitCsvAgentApplyCropCacheToUnits(this: ProductionUnitCsvAgentContext, aggregated: Map<string, ProductionUnitRaw>): void {
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.cropName) continue;
        const cacheKey = this.buildCropCacheKey(cycle.cropName, cycle.variety);
        const cached = this.cropCache.get(cacheKey);
        if (!cached) continue;
        cycle.cropType = cached.cropType;
        if (cached.variety) cycle.variety = cached.variety;
        if (cached.species) cycle.cropName = cached.species;
      }
    }
  }
