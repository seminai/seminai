import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';
import { SIGNIFICANT_WORD_MIN_LENGTH } from './product-registration-lookup.support';

export function productRegistrationLookupServiceExtractSignificantWords(this: ProductRegistrationLookupServiceContext, name: string): string[] {
    const normalized = this.normalizeProductName(name);
    return normalized
      .split(' ')
      .filter(
        (word) => word.length >= SIGNIFICANT_WORD_MIN_LENGTH,
      );
  }
