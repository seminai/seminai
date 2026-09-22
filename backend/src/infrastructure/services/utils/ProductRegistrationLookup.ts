import fs from 'fs';
import path from 'path';
import { parseRegistrationNumber } from './parse-registration-number';

type FitosanitarioProduct = {
  num_registrazione: string;
  denominazione_prodotto: string;
  ragione_sociale: string;
  stato_amministrativo: string;
};

const REGISTRATION_AND_NAME_THRESHOLD = 0.55;

/** Result of a product lookup containing registration number and administrative status. */
export type ProductLookupResult = {
  readonly registrationNumber: string;
  readonly administrativeStatus: string;
} | null;

/**
 * Service to lookup product registration numbers from the fitosanitari dataset.
 * Performs fuzzy matching on product names to find registration numbers.
 */
export class ProductRegistrationLookupService {
  private products: FitosanitarioProduct[] = [];
  private isLoaded = false;
  private readonly datasetPath: string;

  constructor(datasetPath?: string) {
    this.datasetPath =
      datasetPath ?? path.resolve(__dirname, '../../../../dataset/fitosanitari/fts_06062025.json');
  }

  /**
   * Loads the fitosanitari dataset from JSON file.
   */
  private loadDataset(): void {
    if (this.isLoaded) {
      return;
    }
    try {
      const fileContent = fs.readFileSync(this.datasetPath, 'utf-8');
      this.products = JSON.parse(fileContent) as FitosanitarioProduct[];
      this.isLoaded = true;
      console.log(`Loaded ${this.products.length} products from fitosanitari dataset`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to load fitosanitari dataset: ${message}`);
      this.products = [];
      this.isLoaded = true;
    }
  }

  /**
   * Normalizes a product name for comparison by:
   * - Converting to uppercase
   * - Removing extra whitespace
   * - Removing special characters except letters, numbers and spaces
   */
  private normalizeProductName(name: string): string {
    return name
      .toUpperCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^A-Z0-9\s]/g, '');
  }

  private normalizeRegistrationNumber(registrationNumber: string): string | null {
    return parseRegistrationNumber(registrationNumber);
  }

  private static readonly SIGNIFICANT_WORD_MIN_LENGTH = 4;
  private static readonly WORD_PREFIX_LENGTH_RATIO = 0.7;
  private static readonly WORD_OVERLAP_MIN_WORDS = 2;
  private static readonly BOUNDED_SUBSTRING_MIN_LENGTH = 5;

  /**
   * Extracts significant words from a product name. A word is significant when
   * it is at least SIGNIFICANT_WORD_MIN_LENGTH characters long: shorter tokens
   * (units, codes, common chemical suffixes) generate accidental matches.
   */
  private extractSignificantWords(name: string): string[] {
    const normalized = this.normalizeProductName(name);
    return normalized
      .split(' ')
      .filter(
        (word) => word.length >= ProductRegistrationLookupService.SIGNIFICANT_WORD_MIN_LENGTH,
      );
  }

  /**
   * Returns true when two significant words are considered equivalent:
   * either fully equal, or one is a prefix of the other and their lengths
   * are within WORD_PREFIX_LENGTH_RATIO. This prevents short fragments like
   * "ONE" from matching long names like "AGROXONE" via substring inclusion.
   */
  private wordsMatch(a: string, b: string): boolean {
    if (a === b) {
      return true;
    }
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    if (!longer.startsWith(shorter)) {
      return false;
    }
    return (
      shorter.length / longer.length >= ProductRegistrationLookupService.WORD_PREFIX_LENGTH_RATIO
    );
  }

  /**
   * Calculates a similarity score between two product names.
   * Returns a score between 0 and 1, where 1 is a perfect match.
   */
  private calculateSimilarity(searchName: string, datasetName: string): number {
    const searchNormalized = this.normalizeProductName(searchName);
    const datasetNormalized = this.normalizeProductName(datasetName);

    if (searchNormalized === datasetNormalized) {
      return 1.0;
    }

    if (this.isBoundedSubstring(datasetNormalized, searchNormalized)) {
      return 0.9;
    }

    if (
      this.isBoundedSubstring(searchNormalized, datasetNormalized) &&
      datasetNormalized.length / searchNormalized.length >= 0.4
    ) {
      return 0.85;
    }

    const searchWords = this.extractSignificantWords(searchName);
    const datasetWords = this.extractSignificantWords(datasetName);

    if (
      searchWords.length < ProductRegistrationLookupService.WORD_OVERLAP_MIN_WORDS ||
      datasetWords.length < ProductRegistrationLookupService.WORD_OVERLAP_MIN_WORDS
    ) {
      return 0;
    }

    let matchingWords = 0;
    for (const searchWord of searchWords) {
      if (datasetWords.some((datasetWord) => this.wordsMatch(searchWord, datasetWord))) {
        matchingWords += 1;
      }
    }

    return matchingWords / Math.max(searchWords.length, datasetWords.length);
  }

  /**
   * Returns true when one of the normalized names is the same as, or contained in, the other.
   * Used as a safety net to reject perfect word-overlap scores between products that
   * happen to share the same significant tokens but are not actually the same product.
   */
  private hasContainmentMatch(a: string, b: string): boolean {
    return a === b || a.includes(b) || b.includes(a);
  }

  /**
   * Returns true when needle appears in haystack as a sequence of full words.
   * Requires needle to be at least BOUNDED_SUBSTRING_MIN_LENGTH characters to
   * avoid matches like "ONE" inside "AGROXONE".
   */
  private isBoundedSubstring(haystack: string, needle: string): boolean {
    if (needle.length < ProductRegistrationLookupService.BOUNDED_SUBSTRING_MIN_LENGTH) {
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

  /**
   * Finds the best matching product in the dataset by name.
   * Returns registration number and administrative status if found, otherwise null.
   */
  public findProduct(productName: string): ProductLookupResult {
    this.loadDataset();
    if (this.products.length === 0) {
      return null;
    }
    const MIN_SIMILARITY_THRESHOLD = 0.6;
    const searchNormalized = this.normalizeProductName(productName);
    let bestMatch: { product: FitosanitarioProduct; score: number } | null = null;
    for (const product of this.products) {
      const score = this.calculateSimilarity(productName, product.denominazione_prodotto);
      if (score >= MIN_SIMILARITY_THRESHOLD) {
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { product, score };
        }
      }
    }
    if (bestMatch && bestMatch.score >= 1.0) {
      const datasetNormalized = this.normalizeProductName(bestMatch.product.denominazione_prodotto);
      if (!this.hasContainmentMatch(searchNormalized, datasetNormalized)) {
        console.log(
          `[REGISTRATION_LOOKUP] Rejected perfect word-overlap match for "${productName}" vs "${bestMatch.product.denominazione_prodotto}" (no containment)`,
        );
        return null;
      }
    }
    if (bestMatch) {
      console.log(
        `Found match for "${productName}": ${bestMatch.product.denominazione_prodotto} ` +
          `(${bestMatch.product.num_registrazione}, status: ${bestMatch.product.stato_amministrativo}) ` +
          `with score ${bestMatch.score.toFixed(2)}`,
      );
      return {
        registrationNumber: bestMatch.product.num_registrazione,
        administrativeStatus: bestMatch.product.stato_amministrativo,
      };
    }
    console.log(`No registration number found for product: ${productName}`);
    return null;
  }

  /**
   * Finds the registration number for a product by searching the dataset.
   * Returns the registration number if found with sufficient confidence, otherwise null.
   */
  public findRegistrationNumber(productName: string): string | null {
    return this.findProduct(productName)?.registrationNumber ?? null;
  }

  /**
   * Finds a product by registration number and checks whether the provided name is compatible.
   * Returns null if registration is not found or if name coherence is too weak.
   */
  public findProductByRegistration(params: {
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

  /**
   * Validates if a product exists in the fitosanitari dataset.
   * Returns true if it's considered a "fitofarmaco", false otherwise.
   *
   * Matching strategy:
   * 1. Registration number + name match (primary, threshold 0.55)
   * 2. Name-only fallback (when reg number is a supplier/catalog code, threshold 0.75)
   */
  public validateProduct(regNumber: string, productName: string): boolean {
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

  /**
   * Checks whether a product name matches a dataset entry via containment or similarity.
   */
  private isNameMatch(
    normalizedInputName: string,
    rawInputName: string,
    candidate: FitosanitarioProduct,
    threshold: number,
  ): boolean {
    if (!normalizedInputName) {
      return false;
    }
    const normalizedCandidateName = this.normalizeProductName(candidate.denominazione_prodotto);
    if (
      normalizedCandidateName.includes(normalizedInputName) ||
      normalizedInputName.includes(normalizedCandidateName)
    ) {
      return true;
    }
    return this.calculateSimilarity(rawInputName, candidate.denominazione_prodotto) >= threshold;
  }

  /**
   * Fallback: searches the entire dataset by product name only.
   * Uses a higher threshold (0.75) to reduce false positives when no registration number confirms the match.
   */
  private matchByNameOnly(normalizedInputName: string, rawProductName: string): boolean {
    const NAME_ONLY_THRESHOLD = 0.75;
    for (const product of this.products) {
      if (this.isNameMatch(normalizedInputName, rawProductName, product, NAME_ONLY_THRESHOLD)) {
        console.log(
          `[PRODUCT-VALIDATE] Name-only fallback match: "${rawProductName}" → "${product.denominazione_prodotto}" (${product.num_registrazione})`,
        );
        return true;
      }
    }
    return false;
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
    this.loadDataset();
    if (this.products.length === 0) return [];

    const MIN_FLOOR = 0.2;
    const scored: Array<{
      registrationNumber: string;
      productName: string;
      administrativeStatus: string;
      score: number;
    }> = [];

    for (const product of this.products) {
      const score = this.calculateSimilarity(productName, product.denominazione_prodotto);
      if (score >= MIN_FLOOR) {
        scored.push({
          registrationNumber: product.num_registrazione,
          productName: product.denominazione_prodotto,
          administrativeStatus: product.stato_amministrativo,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }

  /**
   * Returns the official product denomination for a given registration number.
   */
  public getProductDenomination(registrationNumber: string): string | null {
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
    console.log(`[REGISTRATION_LOOKUP] Enriching ${products.length} products`);
    const enriched = products.map((product) => {
      const lookupByRegistration = this.findProductByRegistration({
        registrationNumber: product.registrationNumber,
        productName: product.productName,
      });
      if (lookupByRegistration) {
        return {
          ...product,
          registrationNumber: lookupByRegistration.registrationNumber,
          administrativeStatus: lookupByRegistration.administrativeStatus,
        };
      }
      const lookupResult = this.findProduct(product.productName);
      if (lookupResult) {
        console.log(
          `[REGISTRATION_LOOKUP] ${product.registrationNumber ? 'Replaced invalid' : 'Filled missing'} registration for "${product.productName}": ${product.registrationNumber ?? 'null'} → ${lookupResult.registrationNumber}`,
        );
        return {
          ...product,
          registrationNumber: lookupResult.registrationNumber,
          administrativeStatus: lookupResult.administrativeStatus,
        };
      }
      return product;
    });
    console.log(`[REGISTRATION_LOOKUP] Returning ${enriched.length} enriched products`);
    return enriched;
  }

  /**
   * Extracts a registration number from free text and tries to match it against the dataset.
   * Useful when OCR keeps registration info inside the product description.
   */
  public findProductByRegistrationText(params: {
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
}
