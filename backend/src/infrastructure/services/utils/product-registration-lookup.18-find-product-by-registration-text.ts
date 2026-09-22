import { parseRegistrationNumber } from './parse-registration-number';
import { ProductLookupResult } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceFindProductByRegistrationText(this: ProductRegistrationLookupServiceContext, params: {
    text: string;
    productName: string;
  }): ProductLookupResult {
    const parsedRegistrationNumber = parseRegistrationNumber(params.text);
    if (!parsedRegistrationNumber) {
      return null;
    }
    return this.findProductByRegistration({
      registrationNumber: parsedRegistrationNumber,
      productName: params.productName,
    });
  }
