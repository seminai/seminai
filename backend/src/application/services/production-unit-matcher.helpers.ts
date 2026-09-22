import type {
  BulkCreateJobItemDTO,
  BulkStockItemDTO,
} from '../use-cases/job/BulkCreateProductAndJobUseCase';
import { findCropTaxonomyContext } from '../../infrastructure/services/agents/dosage_agent/cropTaxonomyProvider';
import type {
  CropGroup,
  ProductProductionUnitMatch,
  ResolvedProduct,
  UnmatchedProductWarning,
  UserProductionUnit,
} from './production-unit-matcher.types';

export function buildCropGroups(userProductionUnits: readonly UserProductionUnit[]) {
  const groups = new Map<string, CropGroup>();
  for (const { productionUnit } of userProductionUnits) {
    const cropName = productionUnit.cropName || '';
    const variety = productionUnit.variety || '';
    const key = `${cropName.toLowerCase()}|${variety.toLowerCase()}`;
    const group = groups.get(key) ?? {
      cropName,
      variety,
      taxonomy: findCropTaxonomyContext(cropName, variety),
      pus: [],
    };
    group.pus.push({ id: productionUnit.id, areaHa: productionUnit.areaHa });
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.pus.sort((left, right) => right.areaHa - left.areaHa);
  }
  return groups;
}

export function groupByProductionUnit(input: {
  readonly originalItem: BulkCreateJobItemDTO;
  readonly products: ResolvedProduct[];
  readonly matchResults: ReadonlyMap<number, ProductProductionUnitMatch | null>;
}): { expanded: BulkCreateJobItemDTO[]; warnings: UnmatchedProductWarning[] } {
  const warnings: UnmatchedProductWarning[] = [];
  const productionUnitGroups = new Map<string, BulkStockItemDTO[]>();
  const unmatchedProducts: ResolvedProduct[] = [];
  input.products.forEach((product, index) => {
    const match = input.matchResults.get(index);
    if (!match) {
      unmatchedProducts.push(product);
      return;
    }
    const stocks = productionUnitGroups.get(match.puId) ?? [];
    stocks.push(product.stockItem);
    productionUnitGroups.set(match.puId, stocks);
  });

  if (unmatchedProducts.length > 0 && productionUnitGroups.size > 0) {
    const dominantProductionUnitId = [...productionUnitGroups.entries()].sort(
      (left, right) => right[1].length - left[1].length,
    )[0][0];
    for (const product of unmatchedProducts) {
      productionUnitGroups.get(dominantProductionUnitId)!.push(product.stockItem);
      warnings.push(buildUnmatchedWarning(product, true));
    }
  } else {
    warnings.push(...unmatchedProducts.map((product) => buildUnmatchedWarning(product, false)));
  }

  const fertilizerNote = unmatchedProducts.some((product) => product.isFertilizer)
    ? 'Contiene prodotti non fitosanitari: la risoluzione etichetta è attiva solo per fitofarmaci.'
    : null;
  const expanded = [...productionUnitGroups.entries()].map(([productionUnitId, stocks]) => ({
    ...input.originalItem,
    productionUnitId,
    stocks,
    note: [input.originalItem.note, fertilizerNote].filter(Boolean).join(' | ') || null,
  }));
  return { expanded, warnings };
}

function buildUnmatchedWarning(
  product: ResolvedProduct,
  assignedToDominantUnit: boolean,
): UnmatchedProductWarning {
  if (product.isFertilizer) {
    return {
      productName: product.name,
      registrationNumber: '',
      reason: 'Prodotto non fitosanitario – risoluzione etichetta attiva solo per fitofarmaci',
    };
  }
  const fallbackReason = product.labelError || 'Nessuna unità produttiva compatibile';
  return {
    productName: product.name,
    registrationNumber: product.registrationNumber,
    reason: assignedToDominantUnit
      ? `${fallbackReason} – assegnato alla stessa unità produttiva degli altri prodotti del trattamento`
      : fallbackReason,
  };
}
