import { llmMatchProductToCrop } from '../../infrastructure/services/agents/dosage_agent/llmCropMatcher';
import { mapWithLimit } from '../../infrastructure/services/agents/dosage_agent/parallelLimiter';
import type { DosageAgentContext } from '../../infrastructure/services/agents/dosage_agent/context';
import type {
  CropGroup,
  ProductProductionUnitMatch,
  ResolvedProduct,
} from './production-unit-matcher.types';

const CONFIDENCE_THRESHOLD = 70;
const LLM_CONCURRENCY = 5;

export async function matchProductsToProductionUnits(
  products: readonly ResolvedProduct[],
  cropGroups: ReadonlyMap<string, CropGroup>,
  context?: DosageAgentContext,
): Promise<Map<number, ProductProductionUnitMatch | null>> {
  const results = new Map<number, ProductProductionUnitMatch | null>();
  const cropEntries = [...cropGroups.entries()];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    if (!product.label) {
      results.set(index, null);
      continue;
    }
    const attempts = await mapWithLimit(
      cropEntries,
      async ([, cropGroup]) => ({
        cropGroup,
        result: await llmMatchProductToCrop(
          product.name,
          product.label!,
          cropGroup.cropName,
          cropGroup.variety || undefined,
          cropGroup.taxonomy ?? undefined,
          context,
        ),
        bestProductionUnitId: cropGroup.pus[0].id,
      }),
      LLM_CONCURRENCY,
    );
    let bestMatch: ProductProductionUnitMatch | null = null;
    for (const attempt of attempts) {
      if (
        attempt.result.isCompatible &&
        attempt.result.confidence >= CONFIDENCE_THRESHOLD &&
        (!bestMatch || attempt.result.confidence > bestMatch.confidence)
      ) {
        bestMatch = {
          puId: attempt.bestProductionUnitId,
          confidence: attempt.result.confidence,
        };
      }
    }
    results.set(index, bestMatch);
  }
  return results;
}
