import { FitosanitarioProduct } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceIsNameMatch(this: ProductRegistrationLookupServiceContext, normalizedInputName: string, rawInputName: string, candidate: FitosanitarioProduct, threshold: number): boolean {
    if (!normalizedInputName) {
      return false;
    }
    const normalizedCandidateName = this.normalizeProductName(candidate.denominazione_prodotto);
    if (
      normalizedCandidateName.includes(normalizedInputName) ||
      normalizedInputName.includes(normalizedCandidateName)
    ) {
      return true;
    }
    return this.calculateSimilarity(rawInputName, candidate.denominazione_prodotto) >= threshold;
  }
