import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';
import { WORD_PREFIX_LENGTH_RATIO } from './product-registration-lookup.support';

export function productRegistrationLookupServiceWordsMatch(this: ProductRegistrationLookupServiceContext, a: string, b: string): boolean {
    if (a === b) {
      return true;
    }
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    if (!longer.startsWith(shorter)) {
      return false;
    }
    return (
      shorter.length / longer.length >= WORD_PREFIX_LENGTH_RATIO
    );
  }
