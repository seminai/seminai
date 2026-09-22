import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceFindRegistrationNumber(this: ProductRegistrationLookupServiceContext, productName: string): string | null {
    return this.findProduct(productName)?.registrationNumber ?? null;
  }
