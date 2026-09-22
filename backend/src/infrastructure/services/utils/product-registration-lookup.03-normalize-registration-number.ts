import { parseRegistrationNumber } from './parse-registration-number';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceNormalizeRegistrationNumber(this: ProductRegistrationLookupServiceContext, registrationNumber: string): string | null {
    return parseRegistrationNumber(registrationNumber);
  }
