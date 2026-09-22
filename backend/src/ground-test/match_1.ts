import { UnitAllowedProductsOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchCropTreatment';

export interface GroundTruthProductItem {
  readonly name: string;
  readonly regNumber: string;
  readonly quantity: string;
  readonly unit: string;
}

export interface GroundTruthUnitItem {
  readonly unitProductionId: string;
  readonly cropName?: string;
  readonly variety?: string;
  readonly products: ReadonlyArray<GroundTruthProductItem>;
}

export interface Match1OutlierItem {
  readonly cropName: string;
  readonly product: string;
  readonly espectedIn: string; // expected crop (as from ground truth)
  readonly assignedErrorAt: string; // crop where algorithm assigned it (or empty if missing)
}

export interface Match1Report {
  readonly company: string;
  readonly year: number;
  readonly totalGroundTruthProducts: number;
  readonly matched: number;
  readonly accuracy: number; // matched / totalGroundTruthProducts
  readonly outliers: ReadonlyArray<Match1OutlierItem>;
}

function normalizeRegNumber(value: string): string {
  const trimmed = String(value || '').trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, '');
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : '0';
}

export function buildMatch1Report(input: {
  readonly company: string;
  readonly year: number;
  readonly groundTruth: ReadonlyArray<GroundTruthUnitItem>;
  readonly matched: ReadonlyArray<UnitAllowedProductsOutput>;
}): Match1Report {
  const gtByCrop: Map<string, ReadonlyArray<GroundTruthProductItem>> = new Map();
  for (const u of input.groundTruth) {
    const crop = String(u.cropName || u.unitProductionId || '').trim();
    if (!crop) continue;
    gtByCrop.set(crop, u.products);
  }

  const matchedByCrop: Map<string, ReadonlyArray<{ name: string; regNumber: string }>> = new Map();
  for (const u of input.matched) {
    const crop = String(u.cropName || '').trim();
    if (!crop) continue;
    const items = (u.products || []).map((p) => ({ name: p.name, regNumber: p.regNumber }));
    matchedByCrop.set(crop, items);
  }

  let totalGroundTruthProducts = 0;
  let matched = 0;
  const outliers: Match1OutlierItem[] = [];

  for (const [cropName, gtProducts] of gtByCrop.entries()) {
    for (const p of gtProducts) {
      const reg = normalizeRegNumber(p.regNumber);
      if (!reg) continue;
      totalGroundTruthProducts += 1;

      const expectedList = matchedByCrop.get(cropName) || [];
      const inExpectedCrop = expectedList.some((m) => normalizeRegNumber(m.regNumber) === reg);
      if (inExpectedCrop) {
        matched += 1;
        continue;
      }

      let assignedErrorAt = '';
      for (const [crop2, items2] of matchedByCrop.entries()) {
        if (crop2 === cropName) continue;
        const found = items2.some((m) => normalizeRegNumber(m.regNumber) === reg);
        if (found) {
          assignedErrorAt = crop2;
          break;
        }
      }

      outliers.push({
        cropName: cropName,
        product: p.name,
        espectedIn: cropName,
        assignedErrorAt,
      });
    }
  }

  const accuracy = totalGroundTruthProducts > 0 ? matched / totalGroundTruthProducts : 0;
  return {
    company: input.company,
    year: input.year,
    totalGroundTruthProducts,
    matched,
    accuracy,
    outliers,
  };
}
