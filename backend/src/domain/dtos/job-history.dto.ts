/**
 * Metadati aggiuntivi per una entry dello storico
 */
export interface JobHistoryEntryMetadata {
  readonly productionUnitId?: string;
  readonly productionUnitName?: string;
  readonly productId?: string;
  readonly productName?: string;
  readonly productRegistrationNumber?: string;
  readonly companyId?: string;
  readonly companyName?: string;
  readonly stockId?: string;
  readonly stockQuantity?: number;
  readonly stockUnit?: string;
  readonly cropName?: string;
  readonly variety?: string;
  readonly areaHa?: number;
  readonly description?: string;
}

/**
 * Rappresenta una singola entry nello storico delle decisioni di un Job
 */
export interface JobHistoryEntry {
  readonly title: string;
  readonly value: string | number | boolean | null;
  readonly step: string;
  readonly source: string;
  readonly timestamp?: string;
  readonly metadata?: JobHistoryEntryMetadata;
}

/**
 * Informazioni sull'utente che ha effettuato una modifica
 */
export interface JobModificationUser {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

/**
 * Singola modifica di un campo
 */
export interface JobFieldChange {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

/**
 * Entry per tracciare le modifiche manuali di un Job
 */
export interface JobModificationEntry {
  readonly type: 'modification';
  readonly timestamp: string;
  readonly modifiedBy: JobModificationUser;
  readonly changes: ReadonlyArray<JobFieldChange>;
  readonly previousJobSnapshot: Record<string, unknown>;
  readonly reason?: string;
}

/**
 * Union type per le entry della history
 */
export type JobHistoryItem = JobHistoryEntry | JobModificationEntry;

/**
 * Tipo per l'array completo dello storico
 */
export type JobHistory = ReadonlyArray<JobHistoryItem>;

/**
 * Enum per identificare gli step del dosage agent
 */
export enum DosageAgentStep {
  PRODUCT_CLASSIFICATION = 'product_classification',
  CROP_MATCHING = 'crop_matching',
  LLM_FALLBACK_MATCHING = 'llm_fallback_matching',
  ACTIVE_INGREDIENT_COMPATIBILITY = 'active_ingredient_compatibility',
  DOSAGE_SCHEDULING = 'dosage_scheduling',
  DOSAGE_OPTIMIZATION = 'dosage_optimization',
  DISCIPLINARI_VALIDATION = 'disciplinari_validation',
  STOCK_CALCULATION = 'stock_calculation',
  JOB_CREATION = 'job_creation',
}

/**
 * Enum per identificare le fonti dei dati
 */
export enum DataSource {
  LABEL_EXTRACTION = 'label_extraction',
  BDF_DATABASE = 'bdf_database',
  CROP_TAXONOMY = 'crop_taxonomy',
  LLM_OPENAI = 'llm_openai',
  LINEAR_PROGRAMMING = 'linear_programming',
  WAREHOUSE_STOCK = 'warehouse_stock',
  USER_INPUT = 'user_input',
  AUTOMATIC_CALCULATION = 'automatic_calculation',
  TAVILY_SEARCH = 'tavily_search',
  MINISTERIAL_DATASET = 'ministerial_dataset',
  SCRAPEGRAPH_AI = 'scrapegraph_ai',
}
