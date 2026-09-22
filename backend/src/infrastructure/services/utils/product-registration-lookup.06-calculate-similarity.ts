import type { ProductRegistrationLookupServiceContext } from './product-registration-lookup.context';
import { WORD_OVERLAP_MIN_WORDS } from './product-registration-lookup.support';

export function productRegistrationLookupServiceCalculateSimilarity(this: ProductRegistrationLookupServiceContext, searchName: string, datasetName: string): number {
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
      searchWords.length < WORD_OVERLAP_MIN_WORDS ||
      datasetWords.length < WORD_OVERLAP_MIN_WORDS
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
