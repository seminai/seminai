import { buildBdfFallbackLabel } from './bdfDosageEnricher';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { labelNeedsBdfEnrichment, enrichLabelFromBdf } from './bdfLabelEnricher';
import type { Label } from '../../../../domain/dtos/label.dto';
import { AllowedProductResult, CropMatchStageParams, buildProductKey } from './flowMatchCropTreatment.part-01-unit-job-stock-product-summary';

export async function applyBdfFallback(params: CropMatchStageParams): Promise<void> {
  const {
    extractionResults,
    unitId,
    cropName,
    variety,
    areaHa,
    allowed,
    excludedFromMatching,
    quantitiesByProductKey,
    historyManager,
  } = params;
// BDF FALLBACK: For products where SIAN failed (status 'failed' or no label),
// try to build a synthetic label from BDF data
const failedProducts = extractionResults.filter(
  (res) => (res.status !== 'cached' && res.status !== 'extracted') || !res.label,
);

if (failedProducts.length > 0 && cropName) {
  console.log(
    `[MATCH-BDF] ${failedProducts.length} products failed SIAN extraction, trying BDF fallback for unit ${unitId}`,
  );

  for (const res of failedProducts) {
    try {
      const bdfResult = await buildBdfFallbackLabel(res.name, res.regNumber, cropName);
      if (bdfResult) {
        const key = buildProductKey(res.name, res.regNumber);
        const qty = quantitiesByProductKey.get(key);
        const productKey = `${res.name}|${res.regNumber}`;
        console.log(
          `[MATCH-BDF] ✓ BDF fallback matched ${res.name} (${res.regNumber}) for ${cropName} - qty: ${qty?.quantity || 'N/A'}`,
        );

        historyManager.addEntry(
          unitId,
          productKey,
          'Matching prodotto-coltura: Successo BDF fallback',
          `SIAN non disponibile. Label costruita da BDF: ${bdfResult.label.dosaggi_dettagliati.length} dosi, SA: ${bdfResult.label.principio_attivo || 'N/A'}`,
          DosageAgentStep.CROP_MATCHING,
          DataSource.LABEL_EXTRACTION,
          {
            productionUnitId: unitId,
            cropName,
            variety,
            areaHa,
            productName: res.name,
            productRegistrationNumber: res.regNumber,
            description: `BDF fallback: ${bdfResult.label.malattie?.join(', ') || 'N/A'}`,
          },
        );

        const safeRes = {
          name: res.name,
          regNumber: res.regNumber,
          status: 'extracted' as const,
          url: res.url,
          label: bdfResult.label,
          error: res.error,
        };

        const loadWarehouse = qty?.loadWarehouse ?? false;
        const strategy = qty?.strategy;
        const treatedAreaHa = qty?.treatedAreaHa;
        const isLocalizedTreatment = qty?.isLocalizedTreatment;
        const targetStock = qty?.targetStock;
        if (qty && !Number.isNaN(qty.quantity) && qty.quantityUnitOfMeasure) {
          allowed.push({
            ...safeRes,
            quantity: qty.quantity,
            quantityUnitOfMeasure: qty.quantityUnitOfMeasure,
            strategy,
            loadWarehouse,
            treatedAreaHa,
            isLocalizedTreatment,
            targetStock,
          });
        } else {
          allowed.push({
            ...(safeRes as AllowedProductResult),
            strategy,
            loadWarehouse,
            treatedAreaHa,
            isLocalizedTreatment,
            targetStock,
          });
        }
      } else {
        console.log(
          `[MATCH-BDF] ✗ BDF fallback failed for ${res.name} (${res.regNumber}) - product not authorized for ${cropName} or not in BDF`,
        );
        excludedFromMatching.push({
          index: excludedFromMatching.length + 1,
          name: res.name,
          regNumber: res.regNumber,
          exclusionReason: `Etichetta non disponibile (SIAN errore) e prodotto non trovato in BDF per ${cropName}`,
          category: null,
          product: res,
        });
      }
    } catch (err) {
      console.warn(
        `[MATCH-BDF] BDF fallback error for ${res.name}:`,
        err instanceof Error ? err.message : err,
      );
      excludedFromMatching.push({
        index: excludedFromMatching.length + 1,
        name: res.name,
        regNumber: res.regNumber,
        exclusionReason: `Etichetta non disponibile (SIAN errore) e errore BDF: ${err instanceof Error ? err.message : String(err)}`,
        category: null,
        product: res,
      });
    }
  }
}
}

export async function enrichCropLabelsFromBdf(params: CropMatchStageParams): Promise<void> {
  const { unitId, cropName, variety, areaHa, unmatchedProducts, historyManager } = params;
// BDF ENRICHMENT: fill missing critical fields on extracted labels before LLM matching
if (cropName) {
  for (const item of unmatchedProducts) {
    if (!labelNeedsBdfEnrichment(item.label)) continue;
    const productKey = `${item.res.name}|${item.res.regNumber}`;
    const { label: enriched, enrichedFields } = await enrichLabelFromBdf(
      item.label,
      item.res.regNumber,
      item.res.name,
      cropName,
    );
    if (enrichedFields.length > 0) {
      item.label = enriched;
      (item.res as { label: Label }).label = enriched;
      historyManager.addEntry(
        unitId,
        productKey,
        'Label arricchita da BDF',
        `Campi integrati: ${enrichedFields.join(', ')}`,
        DosageAgentStep.CROP_MATCHING,
        DataSource.LABEL_EXTRACTION,
        {
          productionUnitId: unitId,
          cropName,
          variety,
          areaHa,
          productName: item.res.name,
          productRegistrationNumber: item.res.regNumber,
          description: `BDF enrichment: ${enrichedFields.join(', ')}`,
        },
      );
    }
  }
}
}

export interface LlmCropMatchResult {
  readonly isCompatible: boolean;
  readonly confidence: number;
  readonly reason: string;
  readonly matchedCrops: string[];
}
