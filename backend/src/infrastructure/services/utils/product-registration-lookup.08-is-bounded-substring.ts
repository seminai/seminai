import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';
import { BOUNDED_SUBSTRING_MIN_LENGTH } from './product-registration-lookup.support';

export function productRegistrationLookupServiceIsBoundedSubstring(this: ProductRegistrationLookupServiceContext, haystack: string, needle: string): boolean {
    if (needle.length < BOUNDED_SUBSTRING_MIN_LENGTH) {
      return false;
    }
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      const startsOnBoundary = idx === 0 || haystack[idx - 1] === ' ';
      const endsOnBoundary =
        idx + needle.length === haystack.length || haystack[idx + needle.length] === ' ';
      if (startsOnBoundary && endsOnBoundary) {
        return true;
      }
      idx = haystack.indexOf(needle, idx + 1);
    }
    return false;
  }
