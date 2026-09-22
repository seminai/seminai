import { FitosanitarioProduct, ProductLookupResult } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceFindProduct(this: ProductRegistrationLookupServiceContext, productName: string): ProductLookupResult {
    this.loadDataset();
    if (this.products.length === 0) {
      return null;
    }
    const MIN_SIMILARITY_THRESHOLD = 0.6;
    const searchNormalized = this.normalizeProductName(productName);
    let bestMatch: { product: FitosanitarioProduct; score: number } | null = null;
    for (const product of this.products) {
      const score = this.calculateSimilarity(productName, product.denominazione_prodotto);
      if (score >= MIN_SIMILARITY_THRESHOLD) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { product, score };
        }
      }
    }
    if (bestMatch && bestMatch.score >= 1.0) {
      const datasetNormalized = this.normalizeProductName(bestMatch.product.denominazione_prodotto);
      if (!this.hasContainmentMatch(searchNormalized, datasetNormalized)) {
        console.log(
          `[REGISTRATION_LOOKUP] Rejected perfect word-overlap match for "${productName}" vs "${bestMatch.product.denominazione_prodotto}" (no containment)`,
        );
        return null;
      }
    }
    if (bestMatch) {
      console.log(
        `Found match for "${productName}": ${bestMatch.product.denominazione_prodotto} ` +
          `(${bestMatch.product.num_registrazione}, status: ${bestMatch.product.stato_amministrativo}) ` +
          `with score ${bestMatch.score.toFixed(2)}`,
      );
      return {
        registrationNumber: bestMatch.product.num_registrazione,
        administrativeStatus: bestMatch.product.stato_amministrativo,
      };
    }
    console.log(`No registration number found for product: ${productName}`);
    return null;
  }
