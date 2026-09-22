import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { buildProductKey } from './productAccessors';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { DosageStrategy, ProductInfo, calculateOptimalDoses } from './flowOptimizeDosageLineareFunc.part-02-calculate-optimal-doses';
import { OptimizationMetrics } from './flowOptimizeDosageLineareFunc.part-03-build-product-optimization-map';
import { CurrentUnitAllocation, MIN_STOCK_EPSILON, VariableBounds, buildCurrentStrategySolution } from './flowOptimizeDosageLineareFunc.part-01-variable-bounds';

export function optimizeProductMap(
  unitsWithDosage: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
  productMap: ReadonlyMap<string, ProductInfo>,
  strategy: DosageStrategy,
  outStockLimiter: boolean,
  historyManager?: JobHistoryManager,
): OptimizationMetrics {
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
  return { optimizedUnits, totalTreatments, treatmentsWithStockShortage, productsWithStockShortage };
}
