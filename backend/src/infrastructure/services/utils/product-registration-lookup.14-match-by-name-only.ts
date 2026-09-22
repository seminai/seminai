import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceMatchByNameOnly(this: ProductRegistrationLookupServiceContext, normalizedInputName: string, rawProductName: string): boolean {
    const NAME_ONLY_THRESHOLD = 0.75;
    for (const product of this.products) {
      if (this.isNameMatch(normalizedInputName, rawProductName, product, NAME_ONLY_THRESHOLD)) {
        console.log(
          `[PRODUCT-VALIDATE] Name-only fallback match: "${rawProductName}" → "${product.denominazione_prodotto}" (${product.num_registrazione})`,
        );
        return true;
      }
    }
    return false;
  }
