import { Job as PrismaJob, Stock, Product, LabelExtraction } from '@prisma/client';

/**
 * Input per avviare il controllo di conformità
 */
export interface ConformityCheckInput {
  /** ID del gruppo di job da verificare (campo jobId nella tabella Job) */
  readonly jobGroupId: string;
  /** Note agronomiche o regole aggiuntive fornite dall'utente */
  readonly notes?: string;
  /** Se true, salta la validazione rules compliance RAG (costosa) */
  readonly skipRulesCompliance?: boolean;
}

/**
 * Tipo di violazione riscontrata
 */
export type ConformityViolationType =
  | 'ACTIVE_INGREDIENT_INCOMPATIBILITY'
  | 'SUBSTITUTE_PRODUCT'
  | 'DISCIPLINARI_DOSE_EXCEEDED'
  | 'DISCIPLINARI_DOSE_BELOW_MIN'
  | 'N_MAX_APPLICATIONS_EXCEEDED'
  | 'DDT_DATE_MISSING'
  | 'DDT_DATE_INVALID'
  | 'LABEL_NOT_FOUND'
  | 'CROP_NOT_AUTHORIZED'
  | 'CROP_MATCHED_BY_LLM'
  | 'USER_NOTE_WARNING'
  | 'PRODUCT_REVOKED'
  | 'SA_GROUP_LIMIT_EXCEEDED'
  | 'RULES_COMPLIANCE_VIOLATION'
  | 'BUFFER_ZONE_DOSE_EXCEEDED'
  | 'BUFFER_ZONE_EXTRACTION_FAILED'
  | 'RULES_VALIDATION_FAILED'
  | 'BDF_ENRICHMENT_FAILED'
  | 'DOSE_DETAIL_NOT_FOUND'
  | 'MISSING_STOCK_DATA'
  | 'INVALID_AREA';

/**
 * Severità della violazione
 */
export type ConformityViolationSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Dettaglio di una violazione riscontrata
 */
export interface ConformityViolation {
  readonly type: ConformityViolationType;
  readonly message: string;
  readonly severity: ConformityViolationSeverity;
  readonly field?: string;
  readonly currentValue?: string | number;
  readonly expectedValue?: string | number;
  readonly source:
    | 'LABEL'
    | 'DISCIPLINARI'
    | 'USER_NOTES'
    | 'SYSTEM'
    | 'RULES_RAG'
    | 'MINISTERIAL_DATASET';
}

/**
 * Proposta di ottimizzazione per un singolo job
 */
export interface JobOptimizationProposal {
  readonly jobId: string;
  readonly productionUnitId: string;
  readonly productName: string;
  readonly registrationNumber: string | null;
  /** Il job era già stato verificato in precedenza? */
  readonly wasAlreadyChecked: boolean;
  /** Il job è conforme dopo la verifica? */
  readonly isConform: boolean;
  /** Lista delle violazioni riscontrate */
  readonly violations: ReadonlyArray<ConformityViolation>;
  /** Valori originali del job */
  readonly originalValues: {
    readonly quantity: number;
    readonly unitOfMeasureQuantity: string;
    readonly dateOfOpeation: Date;
    readonly treatedSurface: number | null;
  };
  /** Valori proposti (ottimizzati) per il job */
  readonly proposedValues: {
    readonly quantity: number;
    readonly unitOfMeasureQuantity: string;
    readonly dateOfOpeation: Date;
    readonly treatedSurface: number | null;
    /** Nota aggiuntiva con spiegazione delle modifiche */
    readonly note?: string;
    /** Alert notes aggiornate */
    readonly alertNotes?: Record<string, unknown>;
  };
  /** Il job deve essere escluso (dose = 0)? */
  readonly shouldExclude: boolean;
  /** Motivo dell'esclusione se shouldExclude = true */
  readonly exclusionReason?: string;
}

/**
 * Output del controllo di conformità
 */
export interface ConformityCheckOutput {
  /** ID del gruppo di job verificato */
  readonly jobGroupId: string;
  /** Lista delle proposte di ottimizzazione per ogni job */
  readonly proposals: ReadonlyArray<JobOptimizationProposal>;
  /** Riepilogo del controllo */
  readonly summary: {
    readonly totalJobs: number;
    readonly alreadyCheckedJobs: number;
    readonly newlyCheckedJobs: number;
    readonly conformJobs: number;
    readonly nonConformJobs: number;
    readonly jobsToExclude: number;
    readonly totalViolations: number;
    readonly errorCount: number;
    readonly warningCount: number;
  };
  /** Note utente elaborate */
  readonly userNotesAnalysis?: {
    readonly originalNotes: string;
    readonly appliedRules: ReadonlyArray<string>;
    readonly ignoredRules: ReadonlyArray<string>;
  };
  /** Warning di sistema (es: dataset revocati non disponibile, circuit breaker aperto) */
  readonly warnings?: ReadonlyArray<string>;
  /** Timestamp del controllo */
  readonly checkedAt: Date;
}

/**
 * Input per confermare le proposte di ottimizzazione
 */
export interface ConfirmConformityCheckInput {
  /** ID del gruppo di job */
  readonly jobGroupId: string;
  /** IDs dei job da aggiornare (se vuoto, aggiorna tutti) */
  readonly jobIds?: ReadonlyArray<string>;
  /** Le proposte da applicare */
  readonly proposals: ReadonlyArray<JobOptimizationProposal>;
}

/**
 * Risultato della conferma per un singolo job
 */
export interface JobConfirmationResult {
  readonly jobId: string;
  readonly productName: string;
  readonly productionUnitId: string;
  readonly status: 'updated' | 'excluded' | 'error';
  readonly wasExcluded: boolean;
  readonly finalQuantity: number;
  readonly originalQuantity: number;
  readonly unitOfMeasure: string;
  readonly note?: string;
  readonly errorMessage?: string;
}

/**
 * Output della conferma
 */
export interface ConfirmConformityCheckOutput {
  readonly jobGroupId: string;
  readonly updatedJobsCount: number;
  readonly excludedJobsCount: number;
  readonly errorCount: number;
  readonly updatedJobIds: ReadonlyArray<string>;
  /** Dettaglio per ogni job confermato */
  readonly jobResults: ReadonlyArray<JobConfirmationResult>;
}

/**
 * Job con relazioni necessarie per il controllo
 */
export type JobWithRelations = PrismaJob & {
  stocks: Array<
    Stock & {
      product: Product;
    }
  >;
  productionUnit: {
    id: string;
    name: string | null;
    areaHa: number;
    startDate: Date;
    endDate: Date;
  };
  productionCycle?: {
    cropName: string | null;
    cropType: string | null;
    variety: string | null;
  } | null;
};

/**
 * Prodotto con label estratta
 */
export interface ProductWithLabel {
  readonly productId: string;
  readonly productName: string;
  readonly registrationNumber: string | null;
  readonly label: LabelExtraction | null;
}

/**
 * Dati del campo necessari per i controlli di conformità
 */
/** Type-safe label map used across loaders and matchers */
export type LabelMap = Map<string, ProductWithLabel['label']>;

export interface FieldDataForConformity {
  readonly fieldId: string;
  readonly companyId: string | null;
  readonly region: string | null;
  readonly bufferZoneNotes: string | null;
  readonly sauHa: number | null;
}
