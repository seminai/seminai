import { buildProductKey } from './productAccessors';
import { getEffectiveAreaHa } from './unitConversion';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageStrategy, ProductInfo } from './flowOptimizeDosageLineareFunc.part-02-calculate-optimal-doses';
import { OptimizationMetrics, buildProductOptimizationMap } from './flowOptimizeDosageLineareFunc.part-03-build-product-optimization-map';
import { optimizeProductMap } from './flowOptimizeDosageLineareFunc.part-04-optimize-product-map';

export function printOptimizationReport(
  productMap: ReadonlyMap<string, ProductInfo>,
  metrics: OptimizationMetrics,
): void {
  const { optimizedUnits, totalTreatments, treatmentsWithStockShortage, productsWithStockShortage } = metrics;
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

  const productMap = await buildProductOptimizationMap(unitsWithDosage, strategy, companyId);

  const metrics = optimizeProductMap(
    unitsWithDosage,
    productMap,
    strategy,
    outStockLimiter,
    historyManager,
  );
  const { optimizedUnits } = metrics;

  printOptimizationReport(productMap, metrics);

  return optimizedUnits;
};
