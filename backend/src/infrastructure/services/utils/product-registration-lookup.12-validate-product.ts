import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceValidateProduct(this: ProductRegistrationLookupServiceContext, regNumber: string, productName: string): boolean {
    this.loadDataset();

    if (!productName) return false;
    const matchByRegistration = this.findProductByRegistration({
      registrationNumber: regNumber,
      productName,
    });
    if (matchByRegistration) {
      return true;
    }
    return this.matchByNameOnly(this.normalizeProductName(productName), productName);
  }
