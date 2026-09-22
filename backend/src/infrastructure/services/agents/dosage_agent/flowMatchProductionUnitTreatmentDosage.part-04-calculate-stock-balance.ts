import { normalizeStockQuantity, getEffectiveAreaHa, type BaseQuantityUnit } from './unitConversion';
import { ProductStockBalance, StockBalanceReport, UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage.part-01-llm-concurrency-limit';

export const calculateStockBalance = (
  units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
): StockBalanceReport => {
  const map = new Map<
    string,
    {
      name: string;
      regNumber: string;
      quantityAvailable: number;
      quantityUom: BaseQuantityUnit;
      targetStock?: number;
      units: Array<{
        unitProductionId: string;
        cropName?: string;
        variety?: string;
        areaHa?: number;
        totalDoseForUnit: number;
        applications: number;
      }>;
    }
  >();

  for (const unit of units) {
    const unitAreaHa = unit.areaHa ?? 0;
    for (const product of unit.products || []) {
      const name = String((product as { name?: string }).name || '');
      const regNumber = String((product as { regNumber?: string }).regNumber || '');
      const key = `${name}|${regNumber}`;

      const effectiveAreaHa = getEffectiveAreaHa({
        unitAreaHa,
        treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
        isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment,
      });

      let totalDose = 0;
      let apps = 0;
      for (const t of product.trattamenti || []) {
        if (typeof t.dose === 'number' && effectiveAreaHa > 0) {
          totalDose += t.dose * effectiveAreaHa;
          apps++;
        }
      }

      if (!map.has(key)) {
        const qty = (product as { quantity?: number }).quantity ?? 0;
        const qtyUom = String(
          (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure || '',
        );
        const norm = normalizeStockQuantity(qty, qtyUom);
        const rawTargetStock = (product as { targetStock?: number }).targetStock;
        const targetStock =
          typeof rawTargetStock === 'number' &&
          Number.isFinite(rawTargetStock) &&
          rawTargetStock > 0
            ? normalizeStockQuantity(rawTargetStock, qtyUom).value
            : undefined;
        map.set(key, {
          name,
          regNumber,
          quantityAvailable: norm.value,
          quantityUom: norm.unit,
          targetStock,
          units: [],
        });
      }
      map.get(key)!.units.push({
        unitProductionId: unit.unitProductionId,
        cropName: unit.cropName,
        variety: unit.variety,
        areaHa: effectiveAreaHa,
        totalDoseForUnit: totalDose,
        applications: apps,
      });
    }
  }

  const products: ProductStockBalance[] = [];
  for (const [, d] of map) {
    const totalUsed = d.units.reduce((s, u) => s + u.totalDoseForUnit, 0);
    const balance = d.quantityAvailable - totalUsed;
    const balanceVsTarget =
      d.targetStock !== undefined ? d.quantityAvailable - totalUsed - d.targetStock : undefined;
    products.push({
      productName: d.name,
      regNumber: d.regNumber,
      quantityAvailable: d.quantityAvailable,
      quantityUom: d.quantityUom,
      totalUsed,
      balance,
      isOverused: balance < 0,
      percentageUsed: d.quantityAvailable > 0 ? (totalUsed / d.quantityAvailable) * 100 : 0,
      targetStock: d.targetStock,
      balanceVsTarget,
      unitBreakdown: d.units,
    });
  }

  return {
    timestamp: new Date(),
    totalProducts: products.length,
    productsOverused: products.filter((p) => p.isOverused).length,
    productsWithinLimit: products.filter((p) => !p.isOverused).length,
    products,
  };
};

export const printStockBalanceReport = (report: StockBalanceReport): void => {
  console.log('\n' + '='.repeat(80));
  console.log('REPORT BILANCIO GIACENZE MAGAZZINO');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Prodotti totali: ${report.totalProducts}`);
  console.log(`Prodotti in sforamento: ${report.productsOverused}`);
  console.log(`Prodotti entro limiti: ${report.productsWithinLimit}`);
  console.log('='.repeat(80));
  for (const product of report.products) {
    const statusIcon = product.isOverused ? '❌' : '✅';
    const statusText = product.isOverused ? 'SFORAMENTO' : 'OK';
    console.log(`\n${statusIcon} ${product.productName.toUpperCase()} (${product.regNumber})`);
    console.log(`   Disponibile: ${product.quantityAvailable.toFixed(2)} ${product.quantityUom}`);
    console.log(`   Utilizzato: ${product.totalUsed.toFixed(2)} ${product.quantityUom}`);
    console.log(
      `   Bilancio: ${product.balance.toFixed(2)} ${product.quantityUom} (${product.percentageUsed.toFixed(1)}% utilizzato)`,
    );
    if (product.targetStock !== undefined) {
      console.log(`   Giacenza target: ${product.targetStock.toFixed(2)} ${product.quantityUom}`);
      console.log(
        `   Bilancio vs target: ${product.balanceVsTarget?.toFixed(2) ?? 'N/A'} ${product.quantityUom}${(product.balanceVsTarget ?? 0) < 0 ? ' ⚠️ TARGET NON RAGGIUNTO' : ''}`,
      );
    }
    console.log(`   Stato: ${statusText}`);
    if (product.unitBreakdown.length > 0) {
      console.log(`   Dettaglio per unità produttive:`);
      for (const unit of product.unitBreakdown) {
        const cropInfo = unit.cropName
          ? `${unit.cropName}${unit.variety ? `/${unit.variety}` : ''}`
          : 'N/A';
        console.log(
          `     - Unit ${unit.unitProductionId} (${cropInfo}): ${unit.totalDoseForUnit.toFixed(2)} ${product.quantityUom} su ${unit.areaHa?.toFixed(2) || 'N/A'} ha (${unit.applications} applicazioni)`,
        );
      }
    }
  }
  console.log('\n' + '='.repeat(80));
  if (report.productsOverused > 0) {
    console.log('⚠️  ATTENZIONE: Alcuni prodotti hanno sforato le giacenze disponibili!');
  } else {
    console.log('✅ Tutti i prodotti sono entro i limiti delle giacenze disponibili.');
  }
  console.log('='.repeat(80) + '\n');
};
