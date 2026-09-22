import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceNormalizeProductName(this: ProductRegistrationLookupServiceContext, name: string): string {
    return name
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^A-Z0-9\s]/g, '');
  }
