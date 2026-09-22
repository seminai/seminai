import { REGISTRATION_AND_NAME_THRESHOLD, ProductLookupResult } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';

export function productRegistrationLookupServiceFindProductByRegistration(this: ProductRegistrationLookupServiceContext, params: {
    registrationNumber: string | null;
    productName: string;
  }): ProductLookupResult {
    this.loadDataset();
    const normalizedRegistration = this.normalizeRegistrationNumber(
      params.registrationNumber ?? '',
    );
    if (!normalizedRegistration) {
      return null;
    }
    const candidates = this.products.filter(
      (product) =>
        this.normalizeRegistrationNumber(product.num_registrazione) === normalizedRegistration,
    );
    if (candidates.length === 0) {
      return null;
    }
    const normalizedInputName = this.normalizeProductName(params.productName);
    if (!normalizedInputName) {
      const firstCandidate = candidates[0];
      return {
        registrationNumber: firstCandidate.num_registrazione,
        administrativeStatus: firstCandidate.stato_amministrativo,
      };
    }
    const compatibleCandidate = candidates.find((candidate) =>
      this.isNameMatch(
        normalizedInputName,
        params.productName,
        candidate,
        REGISTRATION_AND_NAME_THRESHOLD,
      ),
    );
    if (!compatibleCandidate) {
      return null;
    }
    return {
      registrationNumber: compatibleCandidate.num_registrazione,
      administrativeStatus: compatibleCandidate.stato_amministrativo,
    };
  }
