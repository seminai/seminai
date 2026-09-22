/**
 * DTO interfaces for Disciplinari (Regional Integrated Production Guidelines) extraction.
 * Based on the extraction spec schema for parsing Italian agricultural regulations.
 */

/**
 * Document metadata extracted from the disciplinare header/footer.
 */
export interface DisciplinariMetadata {
  readonly region: string;
  readonly year: number;
  readonly version: string | null;
  readonly title: string;
  readonly sourceUrlOrFile: string | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly isExpired: boolean;
}

/**
 * Crop information within a scope entity.
 */
export interface CropScope {
  readonly name: string;
  readonly group: string | null;
}

/**
 * Section information within a scope entity.
 */
export interface SectionScope {
  readonly name: string;
}

/**
 * Subsection information within a scope entity.
 */
export interface SubsectionScope {
  readonly name: string | null;
}

/**
 * Scope entity defining the context (crop, section, subsection) for rules.
 */
export interface ScopeEntity {
  readonly crop: CropScope;
  readonly section: SectionScope;
  readonly subsection: SubsectionScope | null;
}

/**
 * Glossary definition entry.
 */
export interface GlossaryDefinition {
  readonly term: string;
  readonly definition: string;
}

/**
 * Rules and constraints from the disciplinare.
 */
export interface DisciplinariRules {
  readonly generalPrinciples: ReadonlyArray<string>;
  readonly prohibitions: ReadonlyArray<string>;
  readonly mandatoryActions: ReadonlyArray<string>;
  readonly definitions: ReadonlyArray<GlossaryDefinition>;
}

/**
 * Target pest/disease information.
 */
export interface DefenseTargetInfo {
  readonly name: string;
  readonly type: 'insetto' | 'fungo' | 'infestante' | 'altro';
}

/**
 * Product or active ingredient information.
 */
export interface ProductOrActive {
  readonly name: string;
  readonly normalized: string | null;
}

/**
 * Dose information with min/max values and unit.
 */
export interface DoseInfo {
  readonly min: number | null;
  readonly max: number | null;
  readonly unit: string | null;
  readonly notes: string | null;
}

/**
 * Application limits for interventions.
 */
export interface ApplicationLimits {
  readonly min: number | null;
  readonly max: number | null;
  readonly scope: 'anno' | 'ciclo colturale' | 'stagione' | 'finestra fenologica' | null;
}

/**
 * Interval between treatments.
 */
export interface IntervalInfo {
  readonly minDays: number | null;
}

/**
 * Pre-harvest interval information.
 */
export interface PhiInfo {
  readonly preharvestIntervalDays: number | null;
}

/**
 * Phenological window for application.
 */
export interface PhenologyWindow {
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Source locator for traceability (where in the PDF the data was found).
 */
export interface SourceLocator {
  readonly page: number | null;
  readonly tableId: string | null;
  readonly rowHint: string | null;
}

/**
 * Single intervention (treatment) allowed in the disciplinare.
 */
export interface AllowedIntervention {
  readonly productOrActive: ProductOrActive;
  readonly formulation: string | null;
  readonly dose: DoseInfo;
  readonly applications: ApplicationLimits;
  readonly interval: IntervalInfo;
  readonly phi: PhiInfo | null;
  readonly phenology: PhenologyWindow;
  readonly constraints: ReadonlyArray<string>;
  readonly environmentalConstraints: ReadonlyArray<string>;
  readonly resistanceManagement: ReadonlyArray<string>;
  readonly notes: string | null;
  readonly sourceLocator: SourceLocator;
}

/**
 * Defense target block containing pest/disease info and allowed interventions.
 */
export interface DefenseTarget {
  readonly target: DefenseTargetInfo;
  readonly monitoring: ReadonlyArray<string>;
  readonly agronomicMeasures: ReadonlyArray<string>;
  readonly biologicalMeasures: ReadonlyArray<string>;
  readonly interventions: ReadonlyArray<AllowedIntervention>;
}

/**
 * Unit normalization mapping.
 */
export interface UnitMapping {
  readonly raw: string;
  readonly normalized: string;
}

/**
 * Number range parsing result.
 */
export interface NumberRange {
  readonly raw: string;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
}

/**
 * Active substance dictionary reference.
 */
export interface ActiveSubstanceRef {
  readonly raw: string;
  readonly refId: string;
}

/**
 * Normalization outputs for post-processing.
 */
export interface NormalizationOutputs {
  readonly unitsMap: ReadonlyArray<UnitMapping>;
  readonly numberRanges: ReadonlyArray<NumberRange>;
  readonly activeSubstanceDictionaryRefs: ReadonlyArray<ActiveSubstanceRef>;
}

/**
 * Complete extracted data from a disciplinare document.
 */
export interface DisciplinariExtractedData {
  readonly documentMetadata: DisciplinariMetadata;
  readonly scopeEntities: ReadonlyArray<ScopeEntity>;
  readonly rules: DisciplinariRules;
  readonly defenseTargets: ReadonlyArray<DefenseTarget>;
  readonly normalizationOutputs: NormalizationOutputs | null;
  readonly extractionConfidence: number;
  readonly extractionErrors: ReadonlyArray<string>;
}

/**
 * Result status for extraction operations.
 */
export type DisciplinariExtractionStatus = 'extracted' | 'cached' | 'expired_updated' | 'failed';

/**
 * Single file extraction result.
 */
export interface DisciplinariExtractionResult {
  readonly fileName: string;
  readonly status: DisciplinariExtractionStatus;
  readonly fileHash: string | null;
  readonly bucketUrl: string | null;
  readonly data: DisciplinariExtractedData | null;
  readonly error: string | null;
}

/**
 * Bulk extraction job result.
 */
export interface DisciplinariBulkExtractionResult {
  readonly results: ReadonlyArray<DisciplinariExtractionResult>;
  readonly totalProcessed: number;
  readonly totalExtracted: number;
  readonly totalCached: number;
  readonly totalFailed: number;
  readonly cost: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalCostUsd: number;
    readonly costWithMarginUsd: number;
  };
}

/**
 * Input for bulk extraction request.
 */
export interface DisciplinariBulkExtractionInput {
  readonly files: ReadonlyArray<{
    readonly fileName: string;
    readonly pdfBuffer: Buffer;
  }>;
  readonly userId: string;
  readonly concurrency?: number;
  readonly forceReExtract?: boolean;
}

/**
 * Summary item for listing disciplinari extractions.
 */
export interface DisciplinariExtractionSummary {
  readonly id: string;
  readonly fileName: string;
  readonly region: string;
  readonly year: number;
  readonly title: string;
  readonly validFrom: Date | null;
  readonly validUntil: Date | null;
  readonly isExpired: boolean;
  readonly extractionConfidence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Validity check result.
 */
export interface DisciplinariValidityCheck {
  readonly exists: boolean;
  readonly isValid: boolean;
  readonly isExpired: boolean;
  readonly validUntil: Date | null;
  readonly needsUpdate: boolean;
  readonly lastUpdated: Date | null;
}
