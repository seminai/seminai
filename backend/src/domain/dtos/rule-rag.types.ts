import { RuleCategory } from '@prisma/client';

/**
 * Categories of rules that support PDF vectorization and RAG compliance checks.
 */
export const VECTORIZABLE_RULE_CATEGORIES: ReadonlyArray<RuleCategory> = [
  'DISCIPLINARE',
  'STANDARD',
  'METHODOLOGY',
  'BEST_PRACTICE',
  'CUSTOM',
];

/**
 * Legacy Qdrant collection name. Prefer resolveRulesQdrantCollection().
 */
export const RULES_QDRANT_COLLECTION = 'rules_knowledge_base';

/**
 * Types of rule violations detected during compliance checks.
 */
export type RuleViolationType =
  | 'DOSAGE_EXCEEDED'
  | 'DOSAGE_BELOW_MIN'
  | 'WRONG_TIMING'
  | 'FORBIDDEN_INTERACTION'
  | 'MAX_APPLICATIONS_EXCEEDED'
  | 'FORBIDDEN_ACTIVE_INGREDIENT'
  | 'OTHER';

/**
 * Severity levels for rule violations.
 */
export type RuleViolationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

/**
 * Detailed information about a single rule violation.
 */
export interface RuleViolationDetail {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleCategory: RuleCategory;
  readonly violationType: RuleViolationType;
  readonly severity: RuleViolationSeverity;
  readonly description: string;
  readonly suggestedAction?: string;
  readonly sourceChunk?: string;
}

/**
 * Result of a compliance check against a single rule.
 */
export interface RuleComplianceResult {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly category: RuleCategory;
  readonly score: number;
  readonly relevantChunks: ReadonlyArray<{
    content: string;
    chunkIndex: number;
    score: number;
    page?: number;
  }>;
  readonly isCompliant: boolean;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
}

/**
 * Aggregated compliance validation result for a product.
 */
export interface ProductComplianceValidation {
  readonly isCompliant: boolean;
  readonly overallScore: number;
  readonly violations: ReadonlyArray<RuleViolationDetail>;
  readonly compliantRules: ReadonlyArray<string>;
  readonly recommendations: ReadonlyArray<string>;
}

/**
 * Metadata stored alongside vectors in Qdrant for rule PDFs.
 */
export interface RuleVectorMetadata {
  readonly ruleId: string;
  readonly workspaceId: string;
  readonly category: RuleCategory;
  readonly region?: string;
  readonly sourceType: 'rule_pdf';
  readonly ruleName: string;
}

/**
 * Result from the hybrid PDF parser.
 */
export interface ParsedPdfResult {
  readonly text: string;
  readonly metadata: {
    readonly pageCount: number;
    readonly quality: 'high' | 'medium' | 'low';
    readonly method: 'mistral_ocr' | 'positional_analysis' | 'hybrid';
  };
}

/**
 * Data for a vectorization job in the queue.
 */
export interface VectorizationJobData {
  readonly ruleId: string;
  readonly pdfFileUrl: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly ruleName: string;
  readonly category: RuleCategory;
  readonly region?: string;
}

/**
 * Result of a vectorization job.
 */
export interface VectorizationJobResult {
  readonly ruleId: string;
  readonly chunksCount: number;
  readonly collectionName: string;
  readonly processingTimeMs: number;
  readonly parsingMethod: string;
}

/**
 * Source citation for disciplinare info, providing traceability to the original PDF.
 */
export interface DisciplinareSourceCitation {
  readonly ruleName: string;
  readonly ruleId: string;
  readonly pdfFileUrl: string | null;
  readonly chunkText: string;
}

/**
 * Structured info about a single active ingredient extracted from a disciplinare via LLM.
 * Maps to the typical disciplinare table columns:
 * - Avversità
 * - (1) N° max interventi per singola SA o sottogruppo
 * - (2) N° max interventi per gruppo SA
 * - Limitazioni d'uso e note
 */
export interface DisciplinareActiveIngredientInfo {
  readonly sostanza_attiva: string;
  readonly avversita: ReadonlyArray<string>;
  readonly dosaggi: string | null;
  readonly n_max_interventi_sa: number | null;
  readonly n_max_interventi_sa_scope: string | null;
  readonly n_max_interventi_gruppo: number | null;
  readonly n_max_interventi_gruppo_scope: string | null;
  readonly gruppo_sostanze_attive: ReadonlyArray<string>;
  readonly limitazioni_uso_e_note: string | null;
  readonly sources: ReadonlyArray<DisciplinareSourceCitation>;
}
