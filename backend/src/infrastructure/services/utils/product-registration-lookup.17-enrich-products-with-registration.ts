import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceEnrichProductsWithRegistration<T extends {
      productName: string;
      registrationNumber: string | null;
      administrativeStatus: string | null;
    }>(this: ProductRegistrationLookupServiceContext, products: T[]): T[] {
    console.log(`[REGISTRATION_LOOKUP] Enriching ${products.length} products`);
    const enriched = products.map((product) => {
      const lookupByRegistration = this.findProductByRegistration({
        registrationNumber: product.registrationNumber,
        productName: product.productName,
      });
      if (lookupByRegistration) {
        return {
          ...product,
          registrationNumber: lookupByRegistration.registrationNumber,
          administrativeStatus: lookupByRegistration.administrativeStatus,
        };
      }
      const lookupResult = this.findProduct(product.productName);
      if (lookupResult) {
        console.log(
          `[REGISTRATION_LOOKUP] ${product.registrationNumber ? 'Replaced invalid' : 'Filled missing'} registration for "${product.productName}": ${product.registrationNumber ?? 'null'} → ${lookupResult.registrationNumber}`,
        );
        return {
          ...product,
          registrationNumber: lookupResult.registrationNumber,
          administrativeStatus: lookupResult.administrativeStatus,
        };
      }
      return product;
    });
    console.log(`[REGISTRATION_LOOKUP] Returning ${enriched.length} enriched products`);
    return enriched;
  }
