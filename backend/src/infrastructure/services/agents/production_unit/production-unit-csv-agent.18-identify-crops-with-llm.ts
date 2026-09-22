import { invokeLLMWithRetry } from '../file_agent/utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, CropIdentificationInput, BatchCropIdentificationSchema } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentIdentifyCropsWithLLM(this: ProductionUnitCsvAgentContext, cropInputs: CropIdentificationInput[]): Promise<void> {
    // Filter out already cached and non-agricultural uses
    const nonAgricultural = [
      'uso non agricolo',
      'tare',
      'manufatti',
      'seminativi',
      'siepi',
      'fasce alberate',
      'fossati',
      'canali',
      'fasce tampone',
    ];

    const toIdentify = cropInputs.filter((input) => {
      const cacheKey = this.buildCropCacheKey(input.cropName, input.variety);
      if (this.cropCache.has(cacheKey)) {
        return false;
      }
      const nameLower = input.cropName.toLowerCase();
      for (const na of nonAgricultural) {
        if (nameLower.includes(na)) {
          // Cache non-agricultural as-is
          this.cropCache.set(cacheKey, {
            species: input.cropName,
            cropType: input.cropName,
            code: null,
            variety: input.variety,
          });
          return false;
        }
      }
      return true;
    });

    if (toIdentify.length === 0) {
      return;
    }

    // Batch identify with LLM (with retry)
    const cropUsageAccumulator = new UsageAccumulator();
    const cropUsageCollector = new LangChainUsageCollector(cropUsageAccumulator);
    const extractor = this.getModel().withStructuredOutput(BatchCropIdentificationSchema);

    const cropMessages = [
      {
        role: 'system' as const,
        content: `You are an agricultural expert. For each crop (with optional variety) provided, identify:
1. The correct scientific name (species)
2. The common crop type in Italian
3. A code following the pattern: GENUS_SPE (e.g. MALUS_DOM for Malus domestica)
4. The normalized variety name (if provided, normalize it properly e.g. "GRANNY SMITH" -> "Granny Smith")

IMPORTANT DISTINCTIONS:
- "Melo" = Apple tree = Malus domestica (NOT melone!)
- "Melone" = Melon = Cucumis melo
- "Pero" = Pear tree = Pyrus communis
- "Pesco" = Peach tree = Prunus persica
- "Vite" / "Uva" = Grape vine = Vitis vinifera

Common Italian crop names:
- Frumento tenero / Grano tenero = Triticum aestivum
- Frumento duro / Grano duro = Triticum turgidum ssp. durum
- Mais / Granturco = Zea mays
- Orzo = Hordeum vulgare
- Riso = Oryza sativa
- Soia = Glycine max
- Girasole = Helianthus annuus
- Colza = Brassica napus
- Pomodoro = Solanum lycopersicum
- Patata = Solanum tuberosum

For varieties, normalize the case properly (e.g. "GRANNY SMITH" -> "Granny Smith", "golden delicious" -> "Golden Delicious").
Return the cropType as the Italian common name (e.g. "melo", "pero", "vite").`,
      },
      {
        role: 'user' as const,
        content: `Identify these crops:\n${toIdentify
          .map((input, i) => {
            const varietyStr = input.variety ? ` (variety: ${input.variety})` : '';
            return `${i + 1}. "${input.cropName}"${varietyStr}`;
          })
          .join('\n')}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      cropMessages,
      { callbacks: [cropUsageCollector] },
      { maxRetries: 2, timeoutMs: 30_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(cropUsageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'production-unit-crop-identification', cropCount: toIdentify.length },
      })
      .catch((err) =>
        console.warn('[PRODUCTION-UNIT-CSV] Failed to log crop identification usage:', err),
      );

    // Cache results
    for (let i = 0; i < result.crops.length; i++) {
      const crop = result.crops[i];
      const originalInput = toIdentify[i];
      const cacheKey = this.buildCropCacheKey(originalInput.cropName, originalInput.variety);
      this.cropCache.set(cacheKey, {
        species: crop.species,
        cropType: crop.cropType,
        code: crop.code,
        variety: crop.variety,
      });
    }
  }
