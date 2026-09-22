import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import {
  normalizeDoseRange,
  normalizeStockQuantity,
  getEffectiveAreaHa,
  type BaseDoseUnit,
  type BaseQuantityUnit,
} from './unitConversion';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { prisma } from '../../../repositories/Prisma';
import { calculateBulkAggregatedStock, type AggregatedStockResult } from './stockAggregator';
import { buildProductKey } from './productAccessors';
import { resolveDoseRow } from './perCropDoseRowResolver';

interface VariableBounds {
  readonly min: number;
  readonly max: number;
  readonly target: number;
  readonly area: number;
}

interface LPSolutionResult {
  readonly solution: { [key: string]: number };
  readonly totalRequired: number;
  readonly stockAvailable: number;
  readonly stockShortage: number;
  readonly hasStockShortage: boolean;
  readonly areaByUnitIndex?: { [unitIndex: number]: number };
  readonly areaAdjustmentSummary?: string;
  readonly stockResidual?: number;
  readonly hasStockResidual?: boolean;
}

interface CurrentUnitAllocation {
  readonly unitIndex: number;
  readonly currentAreaHa: number;
  readonly maxAreaHa: number;
  readonly variableNames: ReadonlyArray<string>;
}

const MIN_STOCK_EPSILON = 0.0001;

function sumRequiredQuantity(
  solution: { [key: string]: number },
  variableBounds: { [key: string]: VariableBounds },
): number {
  return Object.keys(variableBounds).reduce((sum, variableName) => {
    const dose = solution[variableName] ?? 0;
    const area = variableBounds[variableName].area;
    return sum + dose * area;
  }, 0);
}

function clampDose(value: number, bounds: VariableBounds): number {
  return Number(Math.max(bounds.min, Math.min(bounds.max, value)).toFixed(4));
}

function buildCurrentStrategySolution(
  variableBounds: { [key: string]: VariableBounds },
  stockAvailable: number,
  unitsAllocation: ReadonlyArray<CurrentUnitAllocation>,
): LPSolutionResult {
  const variables = Object.keys(variableBounds);
  const solution: { [key: string]: number } = {};
  for (const variableName of variables) {
    solution[variableName] = clampDose(
      variableBounds[variableName].target,
      variableBounds[variableName],
    );
  }
  let totalRequired = sumRequiredQuantity(solution, variableBounds);
  if (totalRequired > stockAvailable + MIN_STOCK_EPSILON) {
    let shortageToRecover = totalRequired - stockAvailable;
    const adjustableDoseVariables = variables
      .map((variableName) => {
        const bounds = variableBounds[variableName];
        return {
          variableName,
          reducibleQuantity: (solution[variableName] - bounds.min) * bounds.area,
        };
      })
      .filter((entry) => entry.reducibleQuantity > MIN_STOCK_EPSILON);
    const totalReducibleDose = adjustableDoseVariables.reduce(
      (sum, entry) => sum + entry.reducibleQuantity,
      0,
    );
    if (totalReducibleDose > MIN_STOCK_EPSILON) {
      for (const entry of adjustableDoseVariables) {
        const bounds = variableBounds[entry.variableName];
        const desiredReduction = (entry.reducibleQuantity / totalReducibleDose) * shortageToRecover;
        const nextDose = solution[entry.variableName] - desiredReduction / bounds.area;
        solution[entry.variableName] = clampDose(nextDose, bounds);
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      shortageToRecover = Math.max(0, totalRequired - stockAvailable);
    }
    if (shortageToRecover > MIN_STOCK_EPSILON) {
      const areaByUnitIndex: { [unitIndex: number]: number } = {};
      for (const unitAllocation of unitsAllocation) {
        areaByUnitIndex[unitAllocation.unitIndex] = unitAllocation.currentAreaHa;
      }
      const consumptions = unitsAllocation
        .map((unitAllocation) => {
          const perHaConsumption = unitAllocation.variableNames.reduce((sum, variableName) => {
            return sum + (solution[variableName] ?? 0);
          }, 0);
          const currentConsumption = perHaConsumption * unitAllocation.currentAreaHa;
          return {
            unitIndex: unitAllocation.unitIndex,
            perHaConsumption,
            currentAreaHa: unitAllocation.currentAreaHa,
            currentConsumption,
          };
        })
        .filter(
          (entry) =>
            entry.perHaConsumption > MIN_STOCK_EPSILON && entry.currentAreaHa > MIN_STOCK_EPSILON,
        );
      const totalReducibleByArea = consumptions.reduce(
        (sum, entry) => sum + entry.currentConsumption,
        0,
      );
      if (totalReducibleByArea > MIN_STOCK_EPSILON) {
        for (const entry of consumptions) {
          const share = entry.currentConsumption / totalReducibleByArea;
          const quantityReduction = shortageToRecover * share;
          const areaReduction = quantityReduction / entry.perHaConsumption;
          const nextArea = Math.max(0, entry.currentAreaHa - areaReduction);
          areaByUnitIndex[entry.unitIndex] = Number(nextArea.toFixed(4));
          for (const variableName of variables) {
            if (variableName.startsWith(`u${entry.unitIndex}_`)) {
              variableBounds[variableName] = {
                ...variableBounds[variableName],
                area: Number(nextArea.toFixed(4)),
              };
            }
          }
        }
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      const stockShortage = Math.max(0, totalRequired - stockAvailable);
      const areaReducedUnits = consumptions.length;
      return {
        solution,
        totalRequired,
        stockAvailable,
        stockShortage,
        hasStockShortage: stockShortage > MIN_STOCK_EPSILON,
        areaByUnitIndex,
        areaAdjustmentSummary:
          areaReducedUnits > 0
            ? 'Area ridotta per rispettare lo stock disponibile (strategy=current).'
            : undefined,
      };
    }
  }
  if (totalRequired < stockAvailable - MIN_STOCK_EPSILON) {
    let residualToUse = stockAvailable - totalRequired;
    const expandableDoseVariables = variables
      .map((variableName) => {
        const bounds = variableBounds[variableName];
        return {
          variableName,
          expandableQuantity: (bounds.max - solution[variableName]) * bounds.area,
        };
      })
      .filter((entry) => entry.expandableQuantity > MIN_STOCK_EPSILON);
    const totalExpandableDose = expandableDoseVariables.reduce(
      (sum, entry) => sum + entry.expandableQuantity,
      0,
    );
    if (totalExpandableDose > MIN_STOCK_EPSILON) {
      const quantityToAssign = Math.min(residualToUse, totalExpandableDose);
      for (const entry of expandableDoseVariables) {
        const bounds = variableBounds[entry.variableName];
        const desiredIncrease = (entry.expandableQuantity / totalExpandableDose) * quantityToAssign;
        const nextDose = solution[entry.variableName] + desiredIncrease / bounds.area;
        solution[entry.variableName] = clampDose(nextDose, bounds);
      }
      totalRequired = sumRequiredQuantity(solution, variableBounds);
      residualToUse = Math.max(0, stockAvailable - totalRequired);
    }
    const areaByUnitIndex: { [unitIndex: number]: number } = {};
    for (const unitAllocation of unitsAllocation) {
      areaByUnitIndex[unitAllocation.unitIndex] = unitAllocation.currentAreaHa;
    }
    if (residualToUse > MIN_STOCK_EPSILON) {
      const expandableAreas = unitsAllocation
        .map((unitAllocation) => {
          const perHaConsumption = unitAllocation.variableNames.reduce((sum, variableName) => {
            return sum + (solution[variableName] ?? 0);
          }, 0);
          const maxExpandableArea = Math.max(
            0,
            unitAllocation.maxAreaHa - unitAllocation.currentAreaHa,
          );
          return {
            unitIndex: unitAllocation.unitIndex,
            perHaConsumption,
            maxExpandableArea,
          };
        })
        .filter(
          (entry) =>
            entry.perHaConsumption > MIN_STOCK_EPSILON &&
            entry.maxExpandableArea > MIN_STOCK_EPSILON,
        );
      const totalExpandableByArea = expandableAreas.reduce(
        (sum, entry) => sum + entry.perHaConsumption * entry.maxExpandableArea,
        0,
      );
      if (totalExpandableByArea > MIN_STOCK_EPSILON) {
        const quantityToAssign = Math.min(residualToUse, totalExpandableByArea);
        for (const entry of expandableAreas) {
          const share = (entry.perHaConsumption * entry.maxExpandableArea) / totalExpandableByArea;
          const quantityIncrease = quantityToAssign * share;
          const areaIncrease = Math.min(
            entry.maxExpandableArea,
            quantityIncrease / entry.perHaConsumption,
          );
          const nextArea = Number((areaByUnitIndex[entry.unitIndex] + areaIncrease).toFixed(4));
          areaByUnitIndex[entry.unitIndex] = nextArea;
          for (const variableName of variables) {
            if (variableName.startsWith(`u${entry.unitIndex}_`)) {
              variableBounds[variableName] = {
                ...variableBounds[variableName],
                area: nextArea,
              };
            }
          }
        }
      }
    }
    totalRequired = sumRequiredQuantity(solution, variableBounds);
    const stockResidual = Math.max(0, stockAvailable - totalRequired);
    const hasStockResidual = stockResidual > MIN_STOCK_EPSILON;
    return {
      solution,
      totalRequired,
      stockAvailable,
      stockShortage: 0,
      hasStockShortage: false,
      areaByUnitIndex,
      areaAdjustmentSummary: hasStockResidual
        ? 'Distribuzione estesa tra colture compatibili ma residuo non allocabile entro limiti etichetta.'
        : 'Distribuzione estesa tra colture compatibili per saturare lo stock (strategy=current).',
      stockResidual,
      hasStockResidual,
    };
  }
  const stockShortage = Math.max(0, totalRequired - stockAvailable);
  return {
    solution,
    totalRequired,
    stockAvailable,
    stockShortage,
    hasStockShortage: stockShortage > MIN_STOCK_EPSILON,
  };
}

/**
 * Calcola le dosi ottimali rispettando SEMPRE il range dell'etichetta.
 * @param outStockLimiter - Se true, scala le dosi per rispettare lo stock disponibile.
 *                          Se false (default), usa le dosi ottimali anche se superano lo stock.
 */
function calculateOptimalDoses(
  variableBounds: { [key: string]: VariableBounds },
  stockAvailable: number,
  strategy: 'min' | 'max' | 'avg' | 'current',
  outStockLimiter: boolean = false,
): LPSolutionResult {
  const variables = Object.keys(variableBounds);
  let solution: { [key: string]: number } = {};

  // Calcola la dose ottimale per ogni trattamento rispettando SEMPRE il range etichetta
  for (const varName of variables) {
    const bounds = variableBounds[varName];
    let optimalDose: number;

    switch (strategy) {
      case 'min':
        optimalDose = bounds.min;
        break;
      case 'max':
        optimalDose = bounds.max;
        break;
      case 'current':
        optimalDose = bounds.target;
        break;
      case 'avg':
      default:
        optimalDose = (bounds.min + bounds.max) / 2;
        break;
    }

    // Assicurati che la dose sia nel range [min, max] dell'etichetta
    optimalDose = Math.max(bounds.min, Math.min(bounds.max, optimalDose));
    solution[varName] = Number(optimalDose.toFixed(4));
  }

  // Calcola il totale richiesto con le dosi ottimali
  const originalTotalRequired = variables.reduce(
    (sum, v) => sum + solution[v] * variableBounds[v].area,
    0,
  );

  let totalRequired = originalTotalRequired;
  let hasStockShortage = false;
  let stockShortage = 0;

  // Se lo stock è insufficiente
  if (totalRequired > stockAvailable) {
    stockShortage = totalRequired - stockAvailable;
    hasStockShortage = true;

    // Se outStockLimiter è false (default), NON scala le dosi
    // Usa le dosi ottimali e segnala solo lo shortage
    if (!outStockLimiter) {
      console.log(
        `  [LP] ⚠️ STOCK INSUFFICIENTE (outStockLimiter=false): Richiesto ${totalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}, Mancante ${stockShortage.toFixed(2)}. Dosi NON scalate, il magazzino andrà sotto stock.`,
      );
    } else {
      // outStockLimiter = true: Scala le dosi per rispettare lo stock
      console.log(
        `  [LP] 📦 SCALING ATTIVO (outStockLimiter=true): Richiesto ${totalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}. Procedo con scaling dosi...`,
      );

      // Calcola il minimo totale possibile (tutte le dosi al minimo)
      const minTotalRequired = variables.reduce(
        (sum, v) => sum + variableBounds[v].min * variableBounds[v].area,
        0,
      );

      // Se anche con tutte le dosi al minimo lo stock non è sufficiente
      if (minTotalRequired > stockAvailable) {
        // IMPOSSIBLE CONSTRAINT: respecting stock would require going below label minimum.
        // Business rule: DO NOT go below minimum label dose. Keep minimum doses and report shortage.
        console.log(
          `  [LP] ⚠️ STOCK CRITICO: Minimo richiesto ${minTotalRequired.toFixed(2)}, Disponibile ${stockAvailable.toFixed(2)}. ` +
            `Impossibile rispettare lo stock senza scendere sotto il minimo etichetta. Mantengo le dosi MINIME e segnalo shortage.`,
        );

        // Keep all doses at minimum
        for (const varName of variables) {
          solution[varName] = Number(variableBounds[varName].min.toFixed(4));
        }

        totalRequired = minTotalRequired;
        stockShortage = Math.max(0, totalRequired - stockAvailable);
        hasStockShortage = stockShortage > 0;
      } else {
        // Scala proporzionalmente le dosi rispettando il minimo
        // Algoritmo iterativo per scalare mantenendo i vincoli di minimo
        let remainingStock = stockAvailable;
        const scaledSolution: { [key: string]: number } = {};

        // Prima fase: assegna il minimo a tutte le variabili
        for (const varName of variables) {
          scaledSolution[varName] = variableBounds[varName].min;
          remainingStock -= variableBounds[varName].min * variableBounds[varName].area;
        }

        // Seconda fase: distribuisci lo stock rimanente proporzionalmente
        // tra le variabili che possono ancora essere aumentate
        if (remainingStock > 0) {
          // Calcola quanto "spazio" abbiamo sopra il minimo per ogni variabile
          const excessCapacity = variables.reduce((sum, v) => {
            const excess = (solution[v] - variableBounds[v].min) * variableBounds[v].area;
            return sum + Math.max(0, excess);
          }, 0);

          if (excessCapacity > 0) {
            // Distribuisci lo stock rimanente proporzionalmente
            for (const varName of variables) {
              const bounds = variableBounds[varName];
              const excess = (solution[varName] - bounds.min) * bounds.area;
              if (excess > 0) {
                const proportion = excess / excessCapacity;
                const additionalDose = (remainingStock * proportion) / bounds.area;
                scaledSolution[varName] = Math.min(bounds.max, bounds.min + additionalDose);
              }
            }
          }
        }

        // Arrotonda e assicura che tutte le dosi siano nel range valido
        for (const varName of variables) {
          const bounds = variableBounds[varName];
          scaledSolution[varName] = Number(
            Math.max(bounds.min, Math.min(bounds.max, scaledSolution[varName])).toFixed(4),
          );
        }

        solution = scaledSolution;
        totalRequired = variables.reduce((sum, v) => sum + solution[v] * variableBounds[v].area, 0);
        stockShortage = Math.max(0, totalRequired - stockAvailable);
        hasStockShortage = stockShortage > 0;

        console.log(
          `  [LP] ✅ DOSI SCALATE: Richiesto originale ${originalTotalRequired.toFixed(2)}, Scalato a ${totalRequired.toFixed(2)} per rispettare lo stock (${stockAvailable.toFixed(2)})`,
        );
      }
    }
  }

  return {
    solution,
    totalRequired,
    stockAvailable,
    stockShortage,
    hasStockShortage,
  };
}

export type DosageStrategy = 'min' | 'max' | 'avg' | 'current';

const resolveDosageStrategy = (value: unknown): DosageStrategy | undefined => {
  if (value === 'min' || value === 'max' || value === 'avg' || value === 'current') {
    return value;
  }
  return undefined;
};

interface TreatmentInfo {
  readonly treatmentIndex: number;
  readonly currentDose: number;
  readonly doseMin: number;
  readonly doseMax: number;
  readonly doseUnit: BaseDoseUnit;
  readonly epoca: string;
  readonly label?: { dose_minima?: number; dose_massima?: number };
}

interface UnitInfo {
  readonly unitIndex: number;
  readonly unitId: string;
  readonly cropName: string;
  readonly areaHa: number;
  readonly maxAreaHa: number;
  readonly treatments: Array<TreatmentInfo>;
}

interface ProductInfo {
  quantityAvailable: number;
  quantityUom: BaseQuantityUnit;
  strategy?: DosageStrategy;
  targetStock?: number;
  units: Array<UnitInfo>;
}

/**
 * Ottimizza i dosaggi rispettando SEMPRE il range dell'etichetta.
 * @param outStockLimiter - Se true, scala le dosi per rispettare lo stock disponibile.
 *                          Se false (default), usa le dosi ottimali anche se superano lo stock
 *                          (il magazzino può andare sotto stock).
 * @param companyId - Se fornito, recupera lo stock aggregato reale dal DB invece di usare
 *                    la quantity dall'input. Questo calcola: Stock IN - Stock OUT verificati.
 */
export const flowOptimizeDosageLinearFunc = async (
  unitsWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
  strategy: DosageStrategy = 'avg',
  historyManager?: JobHistoryManager,
  outStockLimiter: boolean = false,
  companyId?: string,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> => {
  console.log('\n[LP-OPT] ═══════════════════════════════════════════════════════════');
  console.log(
    `[LP-OPT] CALCOLO DOSAGGI OTTIMALI (strategia: ${strategy.toUpperCase()}, outStockLimiter: ${outStockLimiter})`,
  );
  console.log('[LP-OPT] ═══════════════════════════════════════════════════════════');

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

  // Ottimizza per ogni prodotto
  const optimizedUnits = [...unitsWithDosage];

  // Metriche
  let totalTreatments = 0;
  let treatmentsWithStockShortage = 0;
  const productsWithStockShortage = new Set<string>();

  for (const [productKey, productData] of productMap) {
    if (productData.units.length === 0) continue;

    console.log(`\n[LP-OPT] ─────────────────────────────────────────────────────────`);
    console.log(`[LP-OPT] Prodotto: ${productKey}`);
    console.log(
      `[LP-OPT]   Stock disponibile: ${productData.quantityAvailable} ${productData.quantityUom}${productData.targetStock ? ` (giacenza da raggiungere: ${productData.targetStock}, stock effettivo ridotto)` : ''}`,
    );
    console.log(`[LP-OPT]   Unità produttive: ${productData.units.length}`);

    const numTreatments = productData.units.reduce((sum, u) => sum + u.treatments.length, 0);
    console.log(`[LP-OPT]   Trattamenti totali: ${numTreatments}`);

    // Costruisci i bounds per ogni variabile
    const variableBounds: { [key: string]: VariableBounds } = {};
    productData.units.forEach((unit) => {
      unit.treatments.forEach((treatment) => {
        const varName = `u${unit.unitIndex}_t${treatment.treatmentIndex}`;
        variableBounds[varName] = {
          min: treatment.doseMin,
          max: treatment.doseMax,
          target: treatment.currentDose,
          area: unit.areaHa,
        };
      });
    });

    const unitsAllocation: ReadonlyArray<CurrentUnitAllocation> = productData.units.map((unit) => ({
      unitIndex: unit.unitIndex,
      currentAreaHa: unit.areaHa,
      maxAreaHa: unit.maxAreaHa,
      variableNames: unit.treatments.map(
        (treatment) => `u${unit.unitIndex}_t${treatment.treatmentIndex}`,
      ),
    }));

    // Calcola le dosi ottimali rispettando SEMPRE il range etichetta
    const effectiveStrategy = productData.strategy ?? strategy;
    const result =
      effectiveStrategy === 'current'
        ? buildCurrentStrategySolution(
            { ...variableBounds },
            productData.quantityAvailable,
            unitsAllocation,
          )
        : calculateOptimalDoses(
            variableBounds,
            productData.quantityAvailable,
            effectiveStrategy,
            outStockLimiter,
          );

    console.log(
      `[LP-OPT]   Quantità richiesta: ${result.totalRequired.toFixed(2)} ${productData.quantityUom}`,
    );

    if (result.hasStockShortage) {
      productsWithStockShortage.add(productKey);
      console.log(
        `[LP-OPT]   ⚠️ STOCK INSUFFICIENTE: mancano ${result.stockShortage.toFixed(2)} ${productData.quantityUom}`,
      );
    } else {
      console.log(`[LP-OPT]   ✅ Stock sufficiente`);
    }
    if (effectiveStrategy === 'current' && result.areaAdjustmentSummary) {
      console.log(`[LP-OPT]   ℹ️ ${result.areaAdjustmentSummary}`);
    }
    if (effectiveStrategy === 'current' && result.hasStockResidual) {
      console.log(
        `[LP-OPT]   ⚠️ Residuo non allocabile: ${result.stockResidual?.toFixed(2) || '0.00'} ${productData.quantityUom}`,
      );
    }

    // Applica la soluzione con alert appropriati
    productData.units.forEach((unit) => {
      const unitData = optimizedUnits[unit.unitIndex];
      const products = [...(unitData.products || [])];

      products.forEach((product) => {
        const name = String((product as { name?: string }).name || '');
        const regNumber = String((product as { regNumber?: string }).regNumber || '');
        const key = buildProductKey(name, regNumber);

        if (key === productKey && product.trattamenti) {
          const trattamenti = [...product.trattamenti];
          const adjustedAreaHa = result.areaByUnitIndex?.[unit.unitIndex] ?? unit.areaHa;
          const safeAdjustedAreaHa = Number(Math.max(0, adjustedAreaHa).toFixed(4));
          const areaDelta = Number((safeAdjustedAreaHa - unit.areaHa).toFixed(4));
          const hasAreaReduction = areaDelta < -MIN_STOCK_EPSILON;
          const hasAreaExpansion = areaDelta > MIN_STOCK_EPSILON;
          unit.treatments.forEach((treatment) => {
            const varName = `u${unit.unitIndex}_t${treatment.treatmentIndex}`;
            const optimizedDose = result.solution[varName];
            if (optimizedDose !== undefined && trattamenti[treatment.treatmentIndex]) {
              totalTreatments++;

              const quantityForArea = optimizedDose * safeAdjustedAreaHa;
              const previousNote = trattamenti[treatment.treatmentIndex].note || '';

              // Check se la dose è sotto il minimo dell'etichetta
              const isBelowMinimum = optimizedDose < treatment.doseMin;
              const belowMinWarning = isBelowMinimum
                ? ` ⚠️ DOSE SOTTO MINIMO ETICHETTA (${treatment.doseMin.toFixed(2)} ${treatment.doseUnit}) - Stock limitato!`
                : '';

              // Costruisci la nota con informazioni complete
              const doseInfo = `[Dose: ${optimizedDose.toFixed(2)} ${treatment.doseUnit} (range etichetta: ${treatment.doseMin.toFixed(2)}-${treatment.doseMax.toFixed(2)})]${belowMinWarning}`;

              // Aggiungi alert sullo stock se necessario
              let stockAlert = '';
              if (effectiveStrategy === 'current' && result.hasStockResidual) {
                stockAlert = ` ⚠️ Residuo non allocabile: ${result.stockResidual?.toFixed(2) || '0.00'} ${productData.quantityUom} anche dopo riallocazione su colture compatibili.`;
              } else if (result.hasStockShortage) {
                treatmentsWithStockShortage++;
                stockAlert = ` ⚠️ ATTENZIONE: Stock insufficiente! Disponibile: ${result.stockAvailable.toFixed(2)} ${productData.quantityUom}, Richiesto totale: ${result.totalRequired.toFixed(2)} ${productData.quantityUom}. Mancano ${result.stockShortage.toFixed(2)} ${productData.quantityUom}. Se verifichi questo job, il magazzino andrà sotto stock.`;
              } else if (isBelowMinimum) {
                stockAlert = ` ⚠️ Stock limitato: ${result.stockAvailable.toFixed(2)} ${productData.quantityUom} - dose scalata per rispettare giacenza`;
              } else {
                stockAlert = ` ✓ Stock disponibile: ${result.stockAvailable.toFixed(2)} ${productData.quantityUom}`;
              }
              const areaInfo = hasAreaReduction
                ? ` [Area trattata ridotta: ${unit.areaHa.toFixed(2)} -> ${safeAdjustedAreaHa.toFixed(2)} ha per rispettare lo stock]`
                : hasAreaExpansion
                  ? ` [Area trattata estesa: ${unit.areaHa.toFixed(2)} -> ${safeAdjustedAreaHa.toFixed(2)} ha per saturare lo stock]`
                  : '';
              const fullNote = [previousNote, doseInfo, areaInfo, stockAlert]
                .filter(Boolean)
                .join(' ')
                .trim();

              trattamenti[treatment.treatmentIndex] = {
                ...trattamenti[treatment.treatmentIndex],
                dose: Number(optimizedDose.toFixed(2)),
                dosaggio_um: treatment.doseUnit,
                note: fullNote,
              };

              // Tracciamento nell'history
              if (historyManager) {
                const [productName, regNumberPart] = productKey.split('|');
                const treatmentNumber = treatment.treatmentIndex + 1;

                // Entry per la dose calcolata
                historyManager.addEntry(
                  unit.unitId,
                  productKey,
                  `Applicazione #${treatmentNumber} (${treatment.epoca}): Dose calcolata`,
                  `${optimizedDose.toFixed(2)} ${treatment.doseUnit}`,
                  DosageAgentStep.DOSAGE_OPTIMIZATION,
                  DataSource.LINEAR_PROGRAMMING,
                  {
                    productionUnitId: unit.unitId,
                    cropName: unit.cropName,
                    areaHa: safeAdjustedAreaHa,
                    productName,
                    productRegistrationNumber: regNumberPart,
                    description: `Quantità totale per ${safeAdjustedAreaHa.toFixed(2)} ha: ${quantityForArea.toFixed(2)} ${treatment.doseUnit.replace('/ha', '')}. Range etichetta: ${treatment.doseMin.toFixed(2)}-${treatment.doseMax.toFixed(2)} ${treatment.doseUnit}. ${hasAreaReduction ? 'Area ridotta per rispettare lo stock.' : ''}${hasAreaExpansion ? 'Area estesa per saturare lo stock.' : ''} ${isBelowMinimum ? '⚠️ DOSE SOTTO MINIMO - Stock limitato!' : '✓ Dose entro range etichetta.'}`,
                  },
                );

                // Entry aggiuntiva per lo stock alert se c'è shortage
                if (result.hasStockShortage) {
                  historyManager.addEntry(
                    unit.unitId,
                    productKey,
                    `⚠️ ALERT: Stock insufficiente per ${productName}`,
                    `Mancano ${result.stockShortage.toFixed(2)} ${productData.quantityUom}`,
                    DosageAgentStep.DOSAGE_OPTIMIZATION,
                    DataSource.WAREHOUSE_STOCK,
                    {
                      productionUnitId: unit.unitId,
                      cropName: unit.cropName,
                      areaHa: safeAdjustedAreaHa,
                      productName,
                      productRegistrationNumber: regNumberPart,
                      stockQuantity: result.stockAvailable,
                      stockUnit: productData.quantityUom,
                      description: `Stock disponibile: ${result.stockAvailable.toFixed(2)} ${productData.quantityUom}. Quantità richiesta per tutti i trattamenti: ${result.totalRequired.toFixed(2)} ${productData.quantityUom}. SHORTAGE: ${result.stockShortage.toFixed(2)} ${productData.quantityUom}. ⚠️ ATTENZIONE: Verificando questo job, il magazzino andrà sotto stock!`,
                    },
                  );
                }
              }
            }
          });
          (
            product as {
              trattamenti?: typeof trattamenti;
              treatedAreaHa?: number;
            }
          ).trattamenti = trattamenti;
          (product as { treatedAreaHa?: number }).treatedAreaHa = Number(
            safeAdjustedAreaHa.toFixed(2),
          );
        }
      });

      optimizedUnits[unit.unitIndex] = { ...unitData, products };
    });

    const percentageOfStock =
      productData.quantityAvailable > 0
        ? (result.totalRequired / productData.quantityAvailable) * 100
        : 0;
    const statusIcon = result.hasStockShortage ? '⚠️' : '✅';
    console.log(
      `[LP-OPT]   ${statusIcon} Utilizzo stock: ${result.totalRequired.toFixed(2)}/${productData.quantityAvailable.toFixed(2)} ${productData.quantityUom} (${percentageOfStock.toFixed(1)}%)`,
    );
  }

  // Report finale
  console.log('\n[LP-OPT] ═══════════════════════════════════════════════════════════');
  console.log('[LP-OPT] REPORT FINALE');
  console.log('[LP-OPT] ═══════════════════════════════════════════════════════════');

  let totalProducts = 0;
  let productsWithSufficientStock = 0;
  let productsWithInsufficientStock = 0;

  for (const [productKey, productData] of productMap) {
    if (productData.units.length === 0) continue;
    totalProducts++;

    const totalRequired = productData.units.reduce((sum, unit) => {
      const unitData = optimizedUnits[unit.unitIndex];
      const products = unitData.products || [];

      for (const product of products) {
        const name = String((product as { name?: string }).name || '');
        const regNumber = String((product as { regNumber?: string }).regNumber || '');
        const key = buildProductKey(name, regNumber);

        if (key === productKey && product.trattamenti) {
          const effectiveAreaHa = getEffectiveAreaHa({
            unitAreaHa: unitData.areaHa || 0,
            treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
            isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean })
              .isLocalizedTreatment,
          });
          for (const trattamento of product.trattamenti) {
            if (typeof trattamento.dose === 'number') {
              sum += trattamento.dose * effectiveAreaHa;
            }
          }
        }
      }
      return sum;
    }, 0);

    if (totalRequired <= productData.quantityAvailable) {
      productsWithSufficientStock++;
    } else {
      productsWithInsufficientStock++;
      const shortage = totalRequired - productData.quantityAvailable;
      console.log(
        `[LP-OPT] ⚠️  ${productKey}: Richiesto ${totalRequired.toFixed(2)}/${productData.quantityAvailable.toFixed(2)} ${productData.quantityUom} (MANCANO: ${shortage.toFixed(2)} ${productData.quantityUom})`,
      );
    }
  }

  console.log('[LP-OPT] ───────────────────────────────────────────────────────────');
  console.log(`[LP-OPT] Riepilogo stock:`);
  console.log(`[LP-OPT]   Prodotti totali: ${totalProducts}`);
  console.log(`[LP-OPT]   ✅ Stock sufficiente: ${productsWithSufficientStock}`);
  console.log(`[LP-OPT]   ⚠️ Stock insufficiente: ${productsWithInsufficientStock}`);

  console.log('[LP-OPT] ───────────────────────────────────────────────────────────');
  console.log(`[LP-OPT] Trattamenti:`);
  console.log(`[LP-OPT]   Totali: ${totalTreatments}`);
  console.log(
    `[LP-OPT]   ✅ Con stock sufficiente: ${totalTreatments - treatmentsWithStockShortage}`,
  );
  console.log(`[LP-OPT]   ⚠️ Con stock insufficiente: ${treatmentsWithStockShortage}`);

  if (productsWithStockShortage.size > 0) {
    console.log('[LP-OPT] ───────────────────────────────────────────────────────────');
    console.log('[LP-OPT] Prodotti con stock insufficiente:');
    Array.from(productsWithStockShortage)
      .sort()
      .forEach((productKey) => {
        console.log(`[LP-OPT]     - ${productKey}`);
      });
  }

  console.log('[LP-OPT] ═══════════════════════════════════════════════════════════\n');

  return optimizedUnits;
};
