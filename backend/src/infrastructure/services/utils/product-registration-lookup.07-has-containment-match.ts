import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceHasContainmentMatch(this: ProductRegistrationLookupServiceContext, a: string, b: string): boolean {
    return a === b || a.includes(b) || b.includes(a);
  }
