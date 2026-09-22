import { BaseMessage } from '@langchain/core/messages';
import { SourceCitation } from '../../chat_dosage_agent/types';
import type { TreatmentPlan } from './plan';
import type { Questionnaire } from './questionnaire';
import type { UnitAllowedProductsOutput } from '../../dosage_agent/flowMatchCropTreatment';
import type { UnitAllowedProductsWithDosageOutput } from '../../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import type { ConformityCheckOutput } from '../../conformity_checker_agent/types';
import type {
  RuleViolationDetail,
  DisciplinareActiveIngredientInfo,
} from '../../../../../domain/dtos/rule-rag.types';
import type { AppliedRulePayload } from '../../../../../domain/dtos/applied-rules.dto';
import type { PublicPlanResult } from '../../../../../domain/entities/fertilizer-plan/types';
import type { AgronomicValidationResult } from '../../../../../domain/entities/agronomic-validation';
import type { SAGroupDiagnostics } from '../../dosage_agent/saGroupLimitsValidator';
import type { CompanyRuleConfigDiagnostics } from '../../dosage_agent/company-rule-config-types';
import type { ToolCallRecord } from '../graph/tool-call-record';
import type { ModelProvider, TaskComplexity } from '../../shared/modelRouter';
import type {
  FieldOccupationDecision,
  NormalizedExtraction,
} from '../../../../../application/services/extraction-normalization/normalized-extraction.types';
import type { PhotoDiagnosis } from './photo-diagnosis';

/**
 * Working memory: intermediate results shared across tool calls.
 * Tools read prerequisites from here and write their results back.
 * Keyed by threadId in a Map singleton (see working-memory.ts).
 */
export interface WorkingMemory {
  /** Product-crop matching results (from search_products) */
  matchedProducts?: ReadonlyArray<UnitAllowedProductsOutput>;
  /** Fingerprint of the product/unit input used for matchedProducts */
  matchedProductsFingerprint?: string;
  /** Fingerprint of input + effective company-rule dosage settings used for matchedProducts */
  matchedProductsDosageContextFingerprint?: string;
  /** Diagnostics for the latest effective company-rule dosage config */
  companyRuleConfigDiagnostics?: CompanyRuleConfigDiagnostics;
  /** Dosage calculations with treatment dates (from calculate_dosage) */
  dosageResults?: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  /** Deterministic agronomic validation (from validate_agronomic_plan / create_treatment_jobs gate) */
  agronomicValidation?: AgronomicValidationResult;
  /** SA-group resistance-limit diagnostics (from validate_sa_group_limits) */
  saGroupDiagnostics?: SAGroupDiagnostics;
  /** Compliance violations (from validate_compliance) */
  complianceResult?: {
    violations: ReadonlyArray<RuleViolationDetail>;
    disciplinareInfoMap?: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
    appliedRulesByProduct?: ReadonlyMap<string, ReadonlyArray<AppliedRulePayload>>;
  };
  /** Stock balance report (from calculate_stock) */
  stockBalance?: unknown;
  /** Field buffer zone data (from extract_buffer_zones) */
  bufferZones?: unknown[];
  /** Cross-product treatment strategy (from plan_strategy) */
  treatmentStrategy?: unknown;
  /** Expanded production units with cycles */
  expandedUnits?: unknown[];
  /** Raw input context */
  inputProducts?: unknown[];
  inputUnits?: unknown[];

  /** Ranked product recommendations (from recommend_best_products) */
  recommendedProducts?: ReadonlyArray<{
    readonly rank: number;
    readonly productName: string;
    readonly registrationNumber: string;
    readonly activeIngredients: ReadonlyArray<string>;
    readonly frac: string | null;
    readonly bio: boolean | null;
    readonly carenzaGiorni: number | null;
    readonly doseRange: string | null;
    readonly inStockQty: number | null;
    readonly score: number;
    readonly source: string;
  }>;

  /** Candidate avversità identified from a photo (from diagnose_from_photo) */
  photoDiagnosis?: PhotoDiagnosis;
  /** Persisted memory context injected into the system prompt */
  memoryContext?: string;
  /** Active treatment plan (from generate_treatment_plan) */
  activePlan?: TreatmentPlan;
  /** Pending questionnaire to be presented to the user (from ask_user_questions) */
  pendingQuestionnaire?: Questionnaire;

  /** Consolidated planning preferences collected via ask_user_questions before start_dosage_agent_job */
  planningPreferences?: {
    readonly strategy?: 'min' | 'max' | 'avg' | 'current';
    readonly startAt?: string;
    readonly endAt?: string;
    readonly outStockLimiter?: boolean;
    readonly objective?:
      | 'minimize_interventions'
      | 'maximize_coverage'
      | 'balanced'
      | 'cost_effective';
    readonly intensity?: 'low' | 'medium' | 'high';
    readonly priorityTargets?: string[];
    readonly agronomicNotes?: string;
    readonly selectedProducts?: ReadonlyArray<{
      readonly productName: string;
      readonly registrationNumber?: string;
      readonly quantity?: number;
      readonly quantityUnitOfMeasure?: string;
    }>;
  };

  /** Job ID returned by start_dosage_agent_job for tracking */
  dosageJobId?: string;

  /**
   * Result of the latest `spawn_subagent` BullMQ job. Written by the worker
   * (`DosageSubagentQueue`) once the job completes; the agent reads it via
   * `get_working_memory_details`. `outcome` is intentionally typed as
   * `unknown[]` to avoid importing the dosage_agent shape into this file
   * (cycle risk) — consumers should narrow the type at read time.
   */
  spawnSubagentResults?: {
    jobId: string;
    status: 'completed' | 'failed';
    outcome: unknown[];
    failedReason?: string;
  };

  /** Thread ID used for the field note agent sub-conversation */
  fieldNoteThreadId?: string;
  /** Chat ID from the field note agent registry (for message persistence) */
  fieldNoteChatId?: string;

  // ── Entity creation (onboarding via agent chat) ──

  /** Uploaded file buffer from chat endpoint — primary file (for extract_from_file) */
  uploadedFileBuffer?: Buffer;
  /** MIME type of the uploaded file */
  uploadedFileMimeType?: string;
  /** Original filename of the uploaded file */
  uploadedFileName?: string;
  /** Multiple uploaded files (for shapefile multi-file or folder uploads) */
  uploadedFiles?: ReadonlyArray<{
    readonly buffer: Buffer;
    readonly mimeType: string;
    readonly fileName: string;
  }>;

  /** Commercial provenance stamped by the email dispatch (Phase 3), for order sourceRef. */
  commercialSource?: {
    readonly channel: 'email' | 'whatsapp' | 'chat' | 'template';
    readonly ingestionId?: string;
  };

  /** Data extracted from file preview (from extract_from_file, for import_from_file) */
  extractedFileData?: {
    companies: unknown[];
    fields: unknown[];
    productionUnits: unknown[];
  };

  /**
   * Deterministic normalization of `extractedFileData` (from normalize_extraction).
   * Carries dedup status per field, occupation info, and UP grouped by
   * (cropName, comune, foglio, usoSuoloPrimario, usoSuoloSecondario).
   */
  normalizedExtraction?: NormalizedExtraction;
  /**
   * User decisions for fields marked as `occupied` in the review form,
   * keyed by NormalizedField.tempId. Consumed by import_from_file.
   */
  fieldOccupationDecisions?: Record<string, FieldOccupationDecision>;

  /** Stock/product data extracted from warehouse file or invoice (for import_stock_from_file) */
  extractedStockData?: unknown[];
  /** Detected file type from auto-detection */
  detectedFileType?: 'agricultural' | 'warehouse_stock' | 'invoice' | 'ddt';

  /** BullMQ job ID for async file extraction in progress */
  pendingExtractionJobId?: string;
  /** Original filename of the file being extracted asynchronously */
  pendingExtractionFileName?: string;
  /**
   * Last extraction failure for this thread. Lets check_extraction_status
   * return a deterministic `failed` payload so the agent does not hallucinate
   * "still processing" after the worker errored out.
   */
  pendingExtractionFailure?: {
    readonly jobId: string;
    readonly errorMessage: string;
    readonly failedAt: number;
  };

  /** ID of company just created via create_company or import_from_file */
  createdCompanyId?: string;
  /** IDs of fields just created via create_fields or import_from_file */
  createdFieldIds?: string[];
  /** Map of cadastral reference key → fieldId (for PU allocation resolution) */
  createdFieldMap?: Record<string, string>;
  /** IDs of production units just created */
  createdProductionUnitIds?: string[];
  /**
   * Logical job group ID (= Job.jobId) of the most recent successful
   * `create_treatment_jobs` invocation. Used by streaming-follow-ups to
   * suggest "view in Archivio" as a follow-up action.
   */
  lastCreatedJobGroupId?: string;

  // ── Conformity check (wrapping conformity_checker_agent) ──

  /** Result of run_conformity_check (proposals + summary), used by confirm_conformity_check */
  conformityCheckResult?: ConformityCheckOutput;

  // ── Context-optimized caches (compact index to LLM, full data here) ──

  /** Cached user fields from list_user_fields */
  userFields?: unknown[];
  /** Cached product labels from search_product_label_database, keyed by registrationNumber */
  labelCache?: Record<string, unknown>;

  /** Pending extraction review pending in Redis (from present_extraction_review tool). */
  pendingExtractionReview?: {
    readonly reviewId: string;
    readonly category: string;
    readonly fileName: string;
  };

  /**
   * @mention items from the most recent user turn. Used by async sub-flows
   * (e.g. ChatExtractionQueue worker) to resolve company references without
   * a second agent round-trip.
   */
  currentMentions?: ReadonlyArray<{
    readonly type: string;
    readonly id: string;
    readonly label: string;
  }>;

  /**
   * Promoted single-company mention UUID. Set ONLY when exactly one
   * company-type mention is present in the user turn (ambiguous otherwise).
   * Lets list_* tools default companyId without re-resolving via name match.
   */
  currentCompanyId?: string;

  /** Sanitized fertilizer plan output (from fertilizer_plan tool). Public-only by construction. */
  fertilizerPlan?: ReadonlyArray<{
    readonly unitId: string;
    readonly unitName: string;
    readonly cropName: string;
    readonly plan: PublicPlanResult | null;
    readonly fertilizerNamesById: Readonly<Record<string, string>>;
    readonly skipped: boolean;
    readonly skippedReason?: string;
  }>;
}

/**
 * State interface for the Dosage ReAct Agent.
 * Extends the chat agent pattern with working memory and loop detection.
 */
/**
 * Lightweight representation of AgentTask for in-graph state.
 */
export interface AgentTaskItem {
  readonly id: string;
  readonly content: string;
  readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  readonly priority: 'high' | 'medium' | 'low';
  readonly sequence: number;
}

export interface DosageReactState {
  /** Full conversation history */
  messages: BaseMessage[];
  /** Pending tool call awaiting approval */
  pendingAction?: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    requiresApproval: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
    riskReason?: string;
  };
  /** Sources and citations from search tools */
  sources?: SourceCitation[];
  /** Loop detection counter */
  loopCounter: number;
  /** Recent tool call names for pattern detection */
  lastToolCalls: string[];
  /** Recent tool calls with argument fingerprints for argument-aware loop detection */
  lastToolCallRecords?: ToolCallRecord[];
  /** Model selected for the latest agent node invocation */
  selectedModel?: {
    readonly provider: ModelProvider;
    readonly modelName: string;
    readonly complexity: TaskComplexity;
  };
  /** Persistent task plan (TodoWrite-equivalent) */
  taskList: AgentTaskItem[];
}
