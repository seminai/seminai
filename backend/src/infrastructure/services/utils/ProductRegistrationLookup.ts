import path from 'path';
import { FitosanitarioProduct, ProductLookupResult } from './product-registration-lookup.support';
import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';
import { productRegistrationLookupServiceLoadDataset } from './product-registration-lookup.01-load-dataset';
import { productRegistrationLookupServiceNormalizeProductName } from './product-registration-lookup.02-normalize-product-name';
import { productRegistrationLookupServiceNormalizeRegistrationNumber } from './product-registration-lookup.03-normalize-registration-number';
import { productRegistrationLookupServiceExtractSignificantWords } from './product-registration-lookup.04-extract-significant-words';
import { productRegistrationLookupServiceWordsMatch } from './product-registration-lookup.05-words-match';
import { productRegistrationLookupServiceCalculateSimilarity } from './product-registration-lookup.06-calculate-similarity';
import { productRegistrationLookupServiceHasContainmentMatch } from './product-registration-lookup.07-has-containment-match';
import { productRegistrationLookupServiceIsBoundedSubstring } from './product-registration-lookup.08-is-bounded-substring';
import { productRegistrationLookupServiceFindProduct } from './product-registration-lookup.09-find-product';
import { productRegistrationLookupServiceFindRegistrationNumber } from './product-registration-lookup.10-find-registration-number';
import { productRegistrationLookupServiceFindProductByRegistration } from './product-registration-lookup.11-find-product-by-registration';
import { productRegistrationLookupServiceValidateProduct } from './product-registration-lookup.12-validate-product';
import { productRegistrationLookupServiceIsNameMatch } from './product-registration-lookup.13-is-name-match';
import { productRegistrationLookupServiceMatchByNameOnly } from './product-registration-lookup.14-match-by-name-only';
import { productRegistrationLookupServiceFindTopCandidates } from './product-registration-lookup.15-find-top-candidates';
import { productRegistrationLookupServiceGetProductDenomination } from './product-registration-lookup.16-get-product-denomination';
import { productRegistrationLookupServiceEnrichProductsWithRegistration } from './product-registration-lookup.17-enrich-products-with-registration';
import { productRegistrationLookupServiceFindProductByRegistrationText } from './product-registration-lookup.18-find-product-by-registration-text';

export { type ProductLookupResult } from './product-registration-lookup.support';

/**
 * Service to lookup product registration numbers from the fitosanitari dataset.
 * Performs fuzzy matching on product names to find registration numbers.
 */
export class ProductRegistrationLookupService {

  products: FitosanitarioProduct[] = [];
  isLoaded = false;
  readonly datasetPath: string;

  constructor(datasetPath?: string) {
    this.datasetPath =
      datasetPath ?? path.resolve(__dirname, '../../../../dataset/fitosanitari/fts_06062025.json');
  }

  /**
   * Loads the fitosanitari dataset from JSON file.
   */
  loadDataset(): void {
    productRegistrationLookupServiceLoadDataset.call(this as unknown as ProductRegistrationLookupServiceContext);
  }

  /**
   * Normalizes a product name for comparison by:
   * - Converting to uppercase
   * - Removing extra whitespace
   * - Removing special characters except letters, numbers and spaces
   */
  normalizeProductName(name: string): string {
    return productRegistrationLookupServiceNormalizeProductName.call(this as unknown as ProductRegistrationLookupServiceContext, name);
  }

  normalizeRegistrationNumber(registrationNumber: string): string | null {
    return productRegistrationLookupServiceNormalizeRegistrationNumber.call(this as unknown as ProductRegistrationLookupServiceContext, registrationNumber);
  }

  /**
   * Extracts significant words from a product name. A word is significant when
   * it is at least SIGNIFICANT_WORD_MIN_LENGTH characters long: shorter tokens
   * (units, codes, common chemical suffixes) generate accidental matches.
   */
  extractSignificantWords(name: string): string[] {
    return productRegistrationLookupServiceExtractSignificantWords.call(this as unknown as ProductRegistrationLookupServiceContext, name);
  }

  /**
   * Returns true when two significant words are considered equivalent:
   * either fully equal, or one is a prefix of the other and their lengths
   * are within WORD_PREFIX_LENGTH_RATIO. This prevents short fragments like
   * "ONE" from matching long names like "AGROXONE" via substring inclusion.
   */
  wordsMatch(a: string, b: string): boolean {
    return productRegistrationLookupServiceWordsMatch.call(this as unknown as ProductRegistrationLookupServiceContext, a, b);
  }

  /**
   * Calculates a similarity score between two product names.
   * Returns a score between 0 and 1, where 1 is a perfect match.
   */
  calculateSimilarity(searchName: string, datasetName: string): number {
    return productRegistrationLookupServiceCalculateSimilarity.call(this as unknown as ProductRegistrationLookupServiceContext, searchName, datasetName);
  }

  /**
   * Returns true when one of the normalized names is the same as, or contained in, the other.
   * Used as a safety net to reject perfect word-overlap scores between products that
   * happen to share the same significant tokens but are not actually the same product.
   */
  hasContainmentMatch(a: string, b: string): boolean {
    return productRegistrationLookupServiceHasContainmentMatch.call(this as unknown as ProductRegistrationLookupServiceContext, a, b);
  }

  /**
   * Returns true when needle appears in haystack as a sequence of full words.
   * Requires needle to be at least BOUNDED_SUBSTRING_MIN_LENGTH characters to
   * avoid matches like "ONE" inside "AGROXONE".
   */
  isBoundedSubstring(haystack: string, needle: string): boolean {
    return productRegistrationLookupServiceIsBoundedSubstring.call(this as unknown as ProductRegistrationLookupServiceContext, haystack, needle);
  }

  /**
   * Finds the best matching product in the dataset by name.
   * Returns registration number and administrative status if found, otherwise null.
   */
  public findProduct(productName: string): ProductLookupResult {
    return productRegistrationLookupServiceFindProduct.call(this as unknown as ProductRegistrationLookupServiceContext, productName);
  }

  /**
   * Finds the registration number for a product by searching the dataset.
   * Returns the registration number if found with sufficient confidence, otherwise null.
   */
  public findRegistrationNumber(productName: string): string | null {
    return productRegistrationLookupServiceFindRegistrationNumber.call(this as unknown as ProductRegistrationLookupServiceContext, productName);
  }

  /**
   * Finds a product by registration number and checks whether the provided name is compatible.
   * Returns null if registration is not found or if name coherence is too weak.
   */
  public findProductByRegistration(params: {
    registrationNumber: string | null;
    productName: string;
  }): ProductLookupResult {
    return productRegistrationLookupServiceFindProductByRegistration.call(this as unknown as ProductRegistrationLookupServiceContext, params);
  }

  /**
   * Validates if a product exists in the fitosanitari dataset.
   * Returns true if it's considered a "fitofarmaco", false otherwise.
   *
   * Matching strategy:
   * 1. Registration number + name match (primary, threshold 0.55)
   * 2. Name-only fallback (when reg number is a supplier/catalog code, threshold 0.75)
   */
  public validateProduct(regNumber: string, productName: string): boolean {
    return productRegistrationLookupServiceValidateProduct.call(this as unknown as ProductRegistrationLookupServiceContext, regNumber, productName);
  }

  /**
   * Checks whether a product name matches a dataset entry via containment or similarity.
   */
  isNameMatch(
    normalizedInputName: string,
    rawInputName: string,
    candidate: FitosanitarioProduct,
    threshold: number,
  ): boolean {
    return productRegistrationLookupServiceIsNameMatch.call(this as unknown as ProductRegistrationLookupServiceContext, normalizedInputName, rawInputName, candidate, threshold);
  }

  /**
   * Fallback: searches the entire dataset by product name only.
   * Uses a higher threshold (0.75) to reduce false positives when no registration number confirms the match.
   */
  matchByNameOnly(normalizedInputName: string, rawProductName: string): boolean {
    return productRegistrationLookupServiceMatchByNameOnly.call(this as unknown as ProductRegistrationLookupServiceContext, normalizedInputName, rawProductName);
  }

  /**
   * Returns the top N products from the dataset sorted by similarity score.
   * Used as candidates for LLM-based fallback matching when fuzzy matching fails.
   */
  public findTopCandidates(
    productName: string,
    topN = 15,
  ): Array<{
    registrationNumber: string;
    productName: string;
    administrativeStatus: string;
    score: number;
  }> {
    return productRegistrationLookupServiceFindTopCandidates.call(this as unknown as ProductRegistrationLookupServiceContext, productName, topN);
  }

  /**
   * Returns the official product denomination for a given registration number.
   */
  public getProductDenomination(registrationNumber: string): string | null {
    return productRegistrationLookupServiceGetProductDenomination.call(this as unknown as ProductRegistrationLookupServiceContext, registrationNumber);
  }

  /**
   * Enriches multiple products with registration numbers and administrative status from the dataset.
   * If a product already has a registrationNumber, validates it against the dataset and
   * replaces it with the correct one if validation fails (e.g. supplier catalog codes from FatturaPA).
   */
  public enrichProductsWithRegistration<
    T extends {
      productName: string;
      registrationNumber: string | null;
      administrativeStatus: string | null;
    },
  >(products: T[]): T[] {
    return productRegistrationLookupServiceEnrichProductsWithRegistration.call(this as unknown as ProductRegistrationLookupServiceContext, products);
  }

  /**
   * Extracts a registration number from free text and tries to match it against the dataset.
   * Useful when OCR keeps registration info inside the product description.
   */
  public findProductByRegistrationText(params: {
    text: string;
    productName: string;
  }): ProductLookupResult {
    return productRegistrationLookupServiceFindProductByRegistrationText.call(this as unknown as ProductRegistrationLookupServiceContext, params);
  }
}
