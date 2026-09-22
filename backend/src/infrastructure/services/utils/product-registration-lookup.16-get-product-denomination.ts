import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceGetProductDenomination(this: ProductRegistrationLookupServiceContext, registrationNumber: string): string | null {
    this.loadDataset();
    const cleanReg = this.normalizeRegistrationNumber(registrationNumber);
    if (!cleanReg) {
      return null;
    }
    const product = this.products.find(
      (p) => this.normalizeRegistrationNumber(p.num_registrazione) === cleanReg,
    );
    return product?.denominazione_prodotto ?? null;
  }
