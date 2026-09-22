export type FitosanitarioProduct = {
  num_registrazione: string;
  denominazione_prodotto: string;
  ragione_sociale: string;
  stato_amministrativo: string;
};


export const REGISTRATION_AND_NAME_THRESHOLD = 0.55;
export const SIGNIFICANT_WORD_MIN_LENGTH = 4;
export const WORD_PREFIX_LENGTH_RATIO = 0.7;
export const WORD_OVERLAP_MIN_WORDS = 2;
export const BOUNDED_SUBSTRING_MIN_LENGTH = 5;


/** Result of a product lookup containing registration number and administrative status. */
export type ProductLookupResult = {
  readonly registrationNumber: string;
  readonly administrativeStatus: string;
} | null;
