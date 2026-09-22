import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { calculateBulkAggregatedStock, type AggregatedStockResult } from './stockAggregator';
import { prisma } from '../../../repositories/Prisma';
import { normalizeDoseRange, normalizeStockQuantity, getEffectiveAreaHa, type BaseDoseUnit, type BaseQuantityUnit } from './unitConversion';
import { buildProductKey } from './productAccessors';
import { resolveDoseRow } from './perCropDoseRowResolver';
import { DosageStrategy, ProductInfo, TreatmentInfo, resolveDosageStrategy } from './flowOptimizeDosageLineareFunc.part-02-calculate-optimal-doses';

export async function buildProductOptimizationMap(
  unitsWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
  strategy: DosageStrategy,
  companyId?: string,
): Promise<Map<string, ProductInfo>> {
// Raccogli tutti i prodotti unici per eventuale lookup stock aggregato dal DB
const uniqueProductKeys: Array<{ name: string; regNumber: string }> = [];
for (const unit of unitsWithDosage) {
  for (const product of unit.products || []) {
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    if (name && !uniqueProductKeys.some((p) => p.name === name && p.regNumber === regNumber)) {
      uniqueProductKeys.push({ name, regNumber });
    }
  }
}

// Se companyId è fornito, recupera lo stock aggregato dal DB
let aggregatedStockMap: Map<string, AggregatedStockResult> | null = null;
if (companyId) {
  console.log(
    `[LP-OPT] Recupero stock aggregato dal DB per ${uniqueProductKeys.length} prodotti (companyId: ${companyId})`,
  );
  aggregatedStockMap = await calculateBulkAggregatedStock(prisma, {
    companyId,
    productKeys: uniqueProductKeys,
  });
  console.log(`[LP-OPT] Stock aggregato trovato per ${aggregatedStockMap.size} prodotti`);
}

// Raggruppa per prodotto
const productMap = new Map<string, ProductInfo>();

// Costruisci la mappa dei prodotti
unitsWithDosage.forEach((unit, unitIndex) => {
  const unitAreaHa = unit.areaHa ?? 0;
  if (!Number.isFinite(unitAreaHa) || unitAreaHa <= 0) {
    console.warn(
      `[LP-OPT] Unit ${unit.unitProductionId} ha area non valida: ${unitAreaHa}. Skipping.`,
    );
    return;
  }
  for (const product of unit.products || []) {
    const effectiveAreaHa = getEffectiveAreaHa({
      unitAreaHa,
      treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
      isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment,
    });
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const key = buildProductKey(name, regNumber);
    const productStrategy = resolveDosageStrategy((product as { strategy?: unknown }).strategy);

    if (!productMap.has(key)) {
      // Usa lo stock aggregato dal DB se disponibile, altrimenti fallback all'input
      const aggregatedStock = aggregatedStockMap?.get(key);
      let quantityAvailable: number;
      let quantityUom: BaseQuantityUnit;

      if (aggregatedStock) {
        // Usa lo stock reale dal DB: Stock IN - Stock OUT verificati
        // Safety: stock negativo (es. OUT > IN per dati inconsistenti) → trattato come 0
        if (aggregatedStock.availableStock < 0) {
          console.warn(
            `[LP-OPT] WARNING: Stock negativo per ${name}: IN=${aggregatedStock.stockInTotal.toFixed(2)}, OUT_verified=${aggregatedStock.stockOutVerifiedTotal.toFixed(2)}. Uso 0.`,
          );
        }
        quantityAvailable = Math.max(0, aggregatedStock.availableStock);
        // Determina l'unità di misura dal prodotto input (fallback)
        const rawQuantityUom = String(
          (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure || '',
        );
        const normalizedQuantity = normalizeStockQuantity(
          aggregatedStock.availableStock,
          rawQuantityUom,
        );
        quantityUom = normalizedQuantity.unit;
        console.log(
          `[LP-OPT]   ${name}: stock DB = ${aggregatedStock.availableStock.toFixed(2)} (IN=${aggregatedStock.stockInTotal.toFixed(2)}, OUT_verified=${aggregatedStock.stockOutVerifiedTotal.toFixed(2)})`,
        );
      } else {
        // Fallback: usa la quantity dall'input (comportamento originale)
        const rawQuantity = (product as { quantity?: number }).quantity ?? 0;
        const rawQuantityUom = String(
          (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure || '',
        );
        const normalizedQuantity = normalizeStockQuantity(rawQuantity, rawQuantityUom);
        quantityAvailable = normalizedQuantity.value;
        quantityUom = normalizedQuantity.unit;
        if (companyId) {
          console.log(
            `[LP-OPT]   ${name}: prodotto non trovato in DB, usando quantity input = ${quantityAvailable.toFixed(2)} ${quantityUom}`,
          );
        }
      }

      // Giacenza da raggiungere: riduce lo stock effettivo disponibile per l'ottimizzazione
      // Normalizza targetStock nella stessa UoM di quantityAvailable
      const rawTargetStock = (product as { targetStock?: number }).targetStock;
      const rawTargetStockUom = String(
        (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure || '',
      );
      const normalizedTargetStock =
        typeof rawTargetStock === 'number' &&
        Number.isFinite(rawTargetStock) &&
        rawTargetStock > 0
          ? normalizeStockQuantity(rawTargetStock, rawTargetStockUom).value
          : undefined;
      const targetStock = normalizedTargetStock;

      // Se targetStock è specificato, lo stock effettivo = disponibile - targetStock
      const effectiveQuantityAvailable = targetStock
        ? Math.max(0, quantityAvailable - targetStock)
        : quantityAvailable;

      if (targetStock) {
        console.log(
          `[LP-OPT]   ${name}: giacenza da raggiungere = ${targetStock} → stock effettivo = ${effectiveQuantityAvailable.toFixed(2)} ${quantityUom}`,
        );
      }

      // Se targetStock è specificato e non c'è una strategy esplicita, usa 'current' come default
      const effectiveStrategy =
        targetStock && !productStrategy ? ('current' as DosageStrategy) : productStrategy;

      productMap.set(key, {
        quantityAvailable: effectiveQuantityAvailable,
        quantityUom,
        strategy: effectiveStrategy,
        targetStock,
        units: [],
      });
    }

    const productEntry = productMap.get(key);
    if (productEntry && productEntry.strategy === undefined && productStrategy) {
      productEntry.strategy = productStrategy;
    }
    const expectedBaseUnit: BaseQuantityUnit = productEntry?.quantityUom ?? 'kg';
    const treatments: Array<TreatmentInfo> = [];
    const effectiveStrategy = productEntry?.strategy ?? strategy;

    if (product.trattamenti && Array.isArray(product.trattamenti)) {
      product.trattamenti.forEach((trattamento, treatmentIndex) => {
        // Estrai limiti dall'etichetta
        const label = (product as { label?: { dosaggi_dettagliati?: Array<unknown> } }).label;
        let doseMin = 0;
        let doseMax = 0;
        let doseUnit: BaseDoseUnit = `${expectedBaseUnit}/ha`;
        let targetDose = 0;

        if (label && Array.isArray(label.dosaggi_dettagliati)) {
          const dosaggiDettagliati = label.dosaggi_dettagliati as Array<{
            coltura?: string;
            malattia?: string | null;
            dose_minima?: number;
            dose_massima?: number;
            dose_um?: string | null;
            acqua_max?: number | null;
            acqua_max_um?: string | null;
            epoca_impiego?: string;
          }>;
          // Resolve the dose row by CROP first (then epoca), so a multi-crop
          // label cannot apply another crop's (higher) dose. Falls back to the
          // first row when no crop matches — same as the legacy behavior.
          const match = resolveDoseRow({
            rows: dosaggiDettagliati.map((d) => ({
              coltura: d.coltura ?? '',
              malattia: d.malattia ?? null,
              epoca_impiego: d.epoca_impiego ?? null,
            })),
            cropName: unit.cropName ?? '',
            epoca: trattamento.epoca_impiego ?? null,
          });
          const selectedDetail = match ? dosaggiDettagliati[match.index] : dosaggiDettagliati[0];
          if (selectedDetail) {
            const normalizedRange = normalizeDoseRange({
              min: selectedDetail.dose_minima,
              max: selectedDetail.dose_massima,
              unit: selectedDetail.dose_um,
              waterVolume: selectedDetail.acqua_max,
              waterVolumeUnit: selectedDetail.acqua_max_um,
              expectedBaseUnit,
            });
            doseMin = normalizedRange.min;
            doseMax = normalizedRange.max;
            doseUnit = normalizedRange.unit;
          }
        }

        // Se dose è già presente (da LLM vecchio), usalo come riferimento
        const existingDose = trattamento.dose ?? 0;

        // Fallback: se non abbiamo limiti dall'etichetta e nemmeno dose, usa valori di default
        // basati sulla formulazione del prodotto (liquido vs solido)
        if (doseMin === 0 && doseMax === 0) {
          if (existingDose > 0) {
            doseMin = existingDose * 0.5;
            doseMax = existingDose * 1.5;
          } else if (expectedBaseUnit === 'L') {
            // Formulazioni liquide (SC, EC, SL, etc.): range tipico 0.1-2.0 L/ha
            doseMin = 0.1;
            doseMax = 2;
          } else {
            // Formulazioni solide (WG, WP, DF, etc.): range tipico 0.5-4.0 kg/ha
            doseMin = 0.5;
            doseMax = 4;
          }
        }

        const averageDose = (doseMin + doseMax) / 2;

        switch (effectiveStrategy) {
          case 'min':
            targetDose = doseMin;
            break;
          case 'max':
            targetDose = doseMax;
            break;
          case 'current':
            targetDose = existingDose > 0 ? existingDose : averageDose;
            break;
          case 'avg':
          default:
            targetDose = averageDose;
            break;
        }

        if (targetDose === 0 && averageDose > 0) {
          targetDose = averageDose;
        }
        if (targetDose === 0 && doseMax > 0) {
          targetDose = doseMax;
        }

        treatments.push({
          treatmentIndex,
          currentDose: targetDose,
          doseMin,
          doseMax,
          doseUnit,
          epoca: trattamento.epoca_impiego ?? '',
          label: label?.dosaggi_dettagliati?.[treatmentIndex] as
            | { dose_minima?: number; dose_massima?: number }
            | undefined,
        });
      });
    }

    if (treatments.length > 0) {
      productMap.get(key)!.units.push({
        unitIndex,
        unitId: unit.unitProductionId,
        cropName: unit.cropName ?? '',
        areaHa: effectiveAreaHa,
        maxAreaHa: unitAreaHa,
        treatments,
      });
    }
  }
});
  return productMap;
}

export interface OptimizationMetrics {
  readonly optimizedUnits: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly totalTreatments: number;
  readonly treatmentsWithStockShortage: number;
  readonly productsWithStockShortage: ReadonlySet<string>;
}
