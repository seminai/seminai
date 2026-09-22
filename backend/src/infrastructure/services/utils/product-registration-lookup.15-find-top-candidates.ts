import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceFindTopCandidates(this: ProductRegistrationLookupServiceContext, productName: string, topN = 15): Array<{
    registrationNumber: string;
    productName: string;
    administrativeStatus: string;
    score: number;
  }> {
    this.loadDataset();
    if (this.products.length === 0) return [];

    const MIN_FLOOR = 0.2;
    const scored: Array<{
      registrationNumber: string;
      productName: string;
      administrativeStatus: string;
      score: number;
    }> = [];

    for (const product of this.products) {
      const score = this.calculateSimilarity(productName, product.denominazione_prodotto);
      if (score >= MIN_FLOOR) {
        scored.push({
          registrationNumber: product.num_registrazione,
          productName: product.denominazione_prodotto,
          administrativeStatus: product.stato_amministrativo,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }
