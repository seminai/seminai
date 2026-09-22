import { BulkExtractItemResult } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import type { Label } from '../../../../domain/dtos/label.dto';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { LlmCropMatchResult } from './flowMatchCropTreatment.part-02-apply-bdf-fallback';
import { AllowedProductResult, ProductQuantityInfo, buildProductKey, normalizeTextForMatch } from './flowMatchCropTreatment.part-01-unit-job-stock-product-summary';

export function applyCompatibleLlmMatch(params: {
  readonly result: BulkExtractItemResult;
  readonly label: Label;
  readonly llmResult: LlmCropMatchResult;
  readonly unitId: string;
  readonly cropName: string;
  readonly variety: string;
  readonly areaHa?: number;
  readonly historyManager: JobHistoryManager;
  readonly quantitiesByProductKey: ReadonlyMap<string, ProductQuantityInfo>;
  readonly allowed: AllowedProductResult[];
}): void {
  const { result: res, label, llmResult, unitId, cropName, variety, areaHa, historyManager, quantitiesByProductKey, allowed } = params;
  const productKey = `${res.name}|${res.regNumber}`;
console.log(
    `[MATCH-LLM] ✓ LLM matched ${res.name} (${res.regNumber}) with confidence ${llmResult.confidence}%: ${llmResult.reason}`,
  );

  // Tracciamento: Matching LLM riuscito
  const llmLabelDescription = label.dosaggi_dettagliati
    ? `Colture etichetta: ${label.colture_target?.join(', ') || 'N/A'}. Principio attivo: ${label.principio_attivo || 'N/A'}. Categoria: ${label.categoria || 'N/A'}.`
    : undefined;

  historyManager.addEntry(
    unitId,
    productKey,
    'Matching prodotto-coltura: Successo LLM',
    `Compatibilità verificata con confidence ${llmResult.confidence}%`,
    DosageAgentStep.LLM_FALLBACK_MATCHING,
    DataSource.LLM_OPENAI,
    {
      productionUnitId: unitId,
      cropName,
      variety,
      areaHa,
      productName: res.name,
      productRegistrationNumber: res.regNumber,
      description: `${llmResult.reason}. ${llmLabelDescription || ''}`,
    },
  );

  const key = buildProductKey(res.name, res.regNumber);
  const qty = quantitiesByProductKey.get(key);

  if (qty && !Number.isNaN(qty.quantity) && qty.quantityUnitOfMeasure) {
    historyManager.addEntry(
      unitId,
      productKey,
      'Quantità prodotto disponibile in magazzino',
      `${qty.quantity} ${qty.quantityUnitOfMeasure}`,
      DosageAgentStep.LLM_FALLBACK_MATCHING,
      DataSource.USER_INPUT,
      {
        productionUnitId: unitId,
        cropName,
        variety,
        productName: res.name,
        productRegistrationNumber: res.regNumber,
        stockQuantity: qty.quantity,
        stockUnit: qty.quantityUnitOfMeasure,
      },
    );
  }

  // Filter dosaggi_dettagliati using LLM matchedCrops for precision
  const matchedCropSet = new Set(
    (llmResult.matchedCrops ?? []).map((c) => normalizeTextForMatch(c)),
  );
  const filteredDosaggi =
    matchedCropSet.size > 0 && Array.isArray(label.dosaggi_dettagliati)
      ? label.dosaggi_dettagliati.filter((d) => {
          const coltura = normalizeTextForMatch(String(d.coltura ?? ''));
          if (!coltura) return false;
          // Check if any matchedCrop is a substring of coltura or vice versa
          return Array.from(matchedCropSet).some(
            (mc) => coltura.includes(mc) || mc.includes(coltura),
          );
        })
      : label.dosaggi_dettagliati ?? [];
  if (filteredDosaggi.length === 0 && (label.dosaggi_dettagliati?.length ?? 0) > 0) {
    console.warn(
      `[MATCH-LLM] matchedCrops filtering returned 0 dosaggi for ${res.name}, ` +
        `keeping all ${label.dosaggi_dettagliati!.length} original dosaggi. ` +
        `matchedCrops: ${JSON.stringify(llmResult.matchedCrops)}`,
    );
  }
  const filteredLabel = {
    ...label,
    dosaggi_dettagliati:
      filteredDosaggi.length > 0 ? filteredDosaggi : label.dosaggi_dettagliati ?? [],
  };
  const safeRes: Omit<BulkExtractItemResult, 'record'> = {
    name: res.name,
    regNumber: res.regNumber,
    status: res.status,
    url: res.url,
    label: filteredLabel,
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
}
