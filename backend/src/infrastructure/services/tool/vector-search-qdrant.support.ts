/**
 * Configurazione per il servizio Qdrant
 */
export interface VectorSearchQdrantConfig {
  url: string;
  apiKey: string;
  collectionName: string;
  embeddingModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}


/**
 * Filtro per la ricerca Qdrant
 */
export interface QdrantSearchFilter {
  must?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
  should?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
  must_not?: Array<{
    key: string;
    match: { value: string | number | boolean };
  }>;
}


/**
 * Opzioni per la ricerca
 */
export interface SearchOptions {
  k?: number;
  filter?: QdrantSearchFilter;
}
