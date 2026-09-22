import { BulkExtractItemResult } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import { normalizeAreaHa } from '../../../utils/area-normalization';
import { findCropTaxonomyContext } from './cropTaxonomyProvider';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import type { Label } from '../../../../domain/dtos/label.dto';
import type { ExcludedProduct } from './types';
import { AllowedProductResult, ProductQuantityInfo, UnitAllowedProductsOutput, parseLocalizedNumber, toOptionalDate } from './flowMatchCropTreatment.part-01-unit-job-stock-product-summary';
import { applyBdfFallback, enrichCropLabelsFromBdf } from './flowMatchCropTreatment.part-02-apply-bdf-fallback';
import { applyLlmCropMatching } from './flowMatchCropTreatment.part-04-apply-llm-crop-matching';

export async function matchProductionUnit(params: {
  readonly unit: unknown;
  readonly extractionResults: ReadonlyArray<BulkExtractItemResult>;
  readonly quantitiesByProductKey: ReadonlyMap<string, ProductQuantityInfo>;
  readonly historyManager: JobHistoryManager;
  readonly context?: DosageAgentContext;
  readonly outputs: Array<UnitAllowedProductsOutput>;
}): Promise<void> {
  const { unit, extractionResults, quantitiesByProductKey, historyManager, context, outputs } = params;
const unitId =
    String((unit as { id?: string }).id ?? '')?.trim() ||
    String((unit as { idApp?: string }).idApp ?? '')?.trim();
  const cropName =
    String((unit as { cropName?: string }).cropName ?? '')?.trim() ||
    String((unit as { coltura?: string }).coltura ?? '')?.trim() ||
    String((unit as { name?: string }).name ?? '')?.trim();
  const variety =
    String((unit as { variety?: string }).variety ?? '')?.trim() ||
    String((unit as { varieta?: string }).varieta ?? '')?.trim() ||
    String((unit as { regione?: string }).regione ?? '')?.trim();
  const areaCandidate: unknown = (unit as { areaHa?: unknown }).areaHa;
  const surfaceRaw: unknown =
    (unit as { superficie?: unknown }).superficie ??
    (unit as { sauHa?: unknown }).sauHa ??
    (unit as { gisHa?: unknown }).gisHa;
  const areaHa: number | undefined =
    normalizeAreaHa(areaCandidate) ??
    (() => {
      const parsed = parseLocalizedNumber(surfaceRaw as string);
      return Number.isFinite(parsed) ? normalizeAreaHa(parsed) ?? undefined : undefined;
    })();
  const startDate = toOptionalDate((unit as { startDate?: Date | string }).startDate);
  const floweringDate = toOptionalDate((unit as { floweringDate?: Date | string }).floweringDate);
  const harvestingDate = toOptionalDate((unit as { harvestingDate?: Date | string }).harvestingDate);
  const endDate = toOptionalDate((unit as { endDate?: Date | string }).endDate);
  const seasonYear = (unit as { seasonYear?: number }).seasonYear;
  const cycleIndex = (unit as { cycleIndex?: number }).cycleIndex;
  const cycleId = (unit as { cycleId?: string }).cycleId;

  if (!unitId) {
    console.warn(`[MATCH] Skipping unit without id`);
    return; // skip units without id
  }

  if (!cropName && !variety) {
    console.warn(`[MATCH] Unit ${unitId} has no crop/variety - skipping`);
    outputs.push({ unitProductionId: unitId, products: [], jobs: [] });
    return;
  }

  const allowed: Array<AllowedProductResult> = [];
  const cropTaxonomy = findCropTaxonomyContext(cropName, variety);
  console.log(
    `[MATCH] Unit ${unitId}: ${cropName}/${variety} - taxonomy: ${cropTaxonomy?.commonName || 'N/A'} (${cropTaxonomy?.family || 'N/A'})`,
  );

  // Tracciamento: Informazioni sulla coltura
  if (cropTaxonomy) {
    historyManager.addEntry(
      unitId,
      `${cropName}|${variety}`,
      'Tassonomia coltura identificata',
      `${cropTaxonomy.commonName} (${cropTaxonomy.family})`,
      DosageAgentStep.CROP_MATCHING,
      DataSource.CROP_TAXONOMY,
      {
        productionUnitId: unitId,
        cropName,
        variety,
        areaHa,
        description: `Famiglia: ${cropTaxonomy.family}, Genere: ${cropTaxonomy.genus || 'N/A'}, Specie: ${cropTaxonomy.species || 'N/A'}, Categoria agronomica: ${cropTaxonomy.agronomicCategory || 'N/A'}`,
      },
    );
  }

  const unmatchedProducts: Array<{
    res: BulkExtractItemResult;
    label: Label;
  }> = [];

  // Raccoglie i prodotti esclusi con le loro motivazioni
  const excludedFromMatching: ExcludedProduct[] = [];

  // All products with valid labels go to LLM for crop matching (no mechanical matching)
  for (const res of extractionResults) {
    if ((res.status !== 'cached' && res.status !== 'extracted') || !res.label) continue;
    unmatchedProducts.push({ res, label: res.label });
  }

  await applyBdfFallback({
    extractionResults,
    unitId,
    cropName,
    variety,
    areaHa,
    cropTaxonomy,
    allowed,
    unmatchedProducts,
    excludedFromMatching,
    quantitiesByProductKey,
    historyManager,
    context,
  });

  await enrichCropLabelsFromBdf({
    extractionResults,
    unitId,
    cropName,
    variety,
    areaHa,
    cropTaxonomy,
    allowed,
    unmatchedProducts,
    excludedFromMatching,
    quantitiesByProductKey,
    historyManager,
    context,
  });

  await applyLlmCropMatching({
    extractionResults,
    unitId,
    cropName,
    variety,
    areaHa,
    cropTaxonomy,
    allowed,
    unmatchedProducts,
    excludedFromMatching,
    quantitiesByProductKey,
    historyManager,
    context,
  });

  // Deduplica prodotti esclusi per nome+regNumber (case-insensitive)
  const seenExcluded = new Set<string>();
  const uniqueExcluded = excludedFromMatching.filter((excl) => {
    const key = `${excl.name.toLowerCase()}|${excl.regNumber.toLowerCase()}`;
    if (seenExcluded.has(key)) {
      return false;
    }
    seenExcluded.add(key);
    return true;
  });

  console.log(
    `[MATCH] Unit ${unitId} final count: ${allowed.length} products matched, ${uniqueExcluded.length} excluded`,
  );
  outputs.push({
    unitProductionId: unitId,
    cycleId,
    cropName,
    variety,
    areaHa,
    startDate,
    floweringDate,
    harvestingDate,
    endDate,
    seasonYear,
    cycleIndex,
    products: allowed,
    jobs: [],
    excludedProducts: uniqueExcluded,
  });
}
