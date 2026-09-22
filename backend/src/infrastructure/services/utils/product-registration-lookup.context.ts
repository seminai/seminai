import { FitosanitarioProduct, ProductLookupResult } from './product-registration-lookup.support';

export interface ProductRegistrationLookupServiceContext {
  products: FitosanitarioProduct[];
  isLoaded: boolean;
  readonly datasetPath: string;
  loadDataset(): void;
  normalizeProductName(name: string): string;
  normalizeRegistrationNumber(registrationNumber: string): string | null;
  extractSignificantWords(name: string): string[];
  wordsMatch(a: string, b: string): boolean;
  calculateSimilarity(searchName: string, datasetName: string): number;
  hasContainmentMatch(a: string, b: string): boolean;
  isBoundedSubstring(haystack: string, needle: string): boolean;
  findProduct(productName: string): ProductLookupResult;
  findRegistrationNumber(productName: string): string | null;
  findProductByRegistration(params: {
    registrationNumber: string | null;
    productName: string;
  }): ProductLookupResult;
  validateProduct(regNumber: string, productName: string): boolean;
  isNameMatch(normalizedInputName: string, rawInputName: string, candidate: FitosanitarioProduct, threshold: number): boolean;
  matchByNameOnly(normalizedInputName: string, rawProductName: string): boolean;
  findTopCandidates(productName: string, topN?: unknown): Array<{
    registrationNumber: string;
    productName: string;
    administrativeStatus: string;
    score: number;
  }>;
  getProductDenomination(registrationNumber: string): string | null;
  enrichProductsWithRegistration<T extends {
      productName: string;
      registrationNumber: string | null;
      administrativeStatus: string | null;
    }>(products: T[]): T[];
  findProductByRegistrationText(params: {
    text: string;
    productName: string;
  }): ProductLookupResult;
}
