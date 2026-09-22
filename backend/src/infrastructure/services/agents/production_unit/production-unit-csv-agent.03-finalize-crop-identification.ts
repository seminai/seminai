import { invokeLLMWithRetry } from '../file_agent/utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { getCropCatalog } from '../../extraction/production-unit-normalizer';
import { applyExactCatalogFallback, resolveUnresolvedCropsWithLlm } from '../../extraction/crop-catalog-resolver';
import { usageLogger, BatchCropIdentificationSchema, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentFinalizeCropIdentification(this: ProductionUnitCsvAgentContext, aggregated: Map<string, ProductionUnitRaw>): Promise<void> {
    this.applyCropCacheToUnits(aggregated);
    if (!this.cropCatalogCache) {
      this.cropCatalogCache = getCropCatalog();
    }
    const unresolvedInputs = this.collectUnresolvedCropInputs(aggregated);
    if (unresolvedInputs.length > 0) {
      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const extractor = this.getModel().withStructuredOutput(BatchCropIdentificationSchema);
      const resolved = await resolveUnresolvedCropsWithLlm({
        inputs: unresolvedInputs,
        catalog: this.cropCatalogCache,
        invokeBatch: (messages, opts) =>
          invokeLLMWithRetry((msgs, o) => extractor.invoke(msgs, o), [...messages], opts, {
            maxRetries: 2,
            timeoutMs: 30_000,
          }),
        callbacks: [usageCollector],
      });
      for (const row of resolved) {
        const cacheKey = this.buildCropCacheKey(row.input.cropName, row.input.variety);
        this.cropCache.set(cacheKey, row.identification);
      }
      usageLogger
        .logFromAccumulator(usageAccumulator, {
          jobType: LlmJobType.CSV_IMPORT,
          model: 'gpt-4o-mini',
          metadata: {
            step: 'production-unit-crop-catalog-resolver',
            cropCount: unresolvedInputs.length,
          },
        })
        .catch((err) =>
          console.warn('[PRODUCTION-UNIT-CSV] Failed to log catalog resolver usage:', err),
        );
      this.applyCropCacheToUnits(aggregated);
    }
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        const fallback = applyExactCatalogFallback(cycle.cropName, this.cropCatalogCache);
        if (fallback) {
          cycle.cropName = fallback.species;
          if (!cycle.cropCode) cycle.cropCode = fallback.code;
        }
      }
    }
  }
