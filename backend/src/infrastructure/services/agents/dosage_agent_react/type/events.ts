import { SourceCitation } from '../../chat_dosage_agent/types';
import type { PlanStep } from './plan';
import type { TaskComplexity, ModelProvider } from '../../shared/modelRouter';
import type { Questionnaire } from './questionnaire';
import type { DocumentCategory } from '@prisma/client';
import type { FieldDescriptor } from '../../../../../domain/extraction-schemas';

/**
 * Stream event types emitted during ReAct agent execution.
 * Extends the chat agent events with ReAct-specific and planning types.
 */
export type StreamEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'working_memory_update'
  | 'complete'
  | 'requires_approval'
  | 'loop_warning'
  | 'error'
  | 'cancelled'
  | 'chat_created'
  // Planning events
  | 'plan_step_generated'
  | 'plan_presented'
  | 'plan_step_modified'
  | 'plan_executing'
  | 'plan_step_executed'
  | 'model_selected'
  // Questionnaire events
  | 'questionnaire_presented'
  // Pipeline progress
  | 'pipeline_progress'
  // Follow-up suggestions
  | 'follow_up_suggestions'
  // Extraction review form events (Fase 3)
  | 'extraction_review_presented'
  | 'extraction_review_saved'
  | 'extraction_review_cancelled'
  // Form patch events (embedded form-editor chat)
  | 'form_patch';

/**
 * Payload for an extraction review form presented to the user.
 */
export interface ExtractionReviewPayload {
  readonly reviewId: string;
  readonly category: DocumentCategory;
  readonly companyId: string;
  readonly fileName: string;
  readonly fileUrl?: string;
  readonly fields: readonly FieldDescriptor[];
  readonly data: Record<string, unknown>;
  /**
   * Optional deterministic normalization (from normalize_extraction) carrying
   * per-field status (new/existing/occupied), occupation details, and UP
   * grouping by (cropName, comune, foglio, usoSuoloPrimario, usoSuoloSecondario).
   * Present only for Piano Colturale-like extractions, otherwise undefined.
   */
  readonly normalization?: import('../../../../../application/services/extraction-normalization/normalized-extraction.types').NormalizedExtraction;
}

/**
 * Patch proposed by an in-form chat agent for a draft Production Units form.
 * The four supported actions cover the operations the user enabled: set fields
 * on an existing unit, add a new unit, remove a unit, and move an allocation
 * between two units.
 */
export type FormPatchPayload =
  | {
      readonly action: 'set_unit_fields';
      readonly unitIndex: number;
      readonly fields: Record<string, unknown>;
    }
  | { readonly action: 'add_unit'; readonly unit?: Record<string, unknown> }
  | { readonly action: 'remove_unit'; readonly unitIndex: number }
  | {
      readonly action: 'move_allocation';
      readonly fromUnitIndex: number;
      readonly allocationIndex: number;
      readonly toUnitIndex: number;
      readonly toAllocationIndex?: number;
    };

/**
 * Stream event emitted during ReAct agent execution.
 */
export interface StreamEvent {
  type: StreamEventType;
  content?: string;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  /** Key updated in working memory */
  workingMemoryKey?: string;
  sources?: SourceCitation[];
  cost?: {
    inputTokens: number;
    outputTokens: number;
    tavilyCalls: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
    /** Provider used for cost attribution */
    provider?: string;
    /** Model name used */
    modelName?: string;
    /** Per-provider breakdown */
    byProvider?: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
  };
  error?: string;
  response?: AgentStreamResponse;
  /** Planning-specific data */
  plan?: {
    planId?: string;
    step?: PlanStep;
    totalSteps?: number;
    currentStep?: number;
    status?: string;
  };
  /** Model selection info (emitted with model_selected event) */
  modelInfo?: {
    provider: ModelProvider;
    modelName: string;
    complexity: TaskComplexity;
  };
  /** Structured questionnaire data (emitted with questionnaire_presented event) */
  questionnaire?: Questionnaire;
  /** Risk level of the pending tool call (emitted with requires_approval event) */
  riskLevel?: 'low' | 'medium' | 'high';
  /** Pipeline progress data (emitted with pipeline_progress event) */
  pipelineProgress?: {
    currentStep: number;
    totalSteps: number;
    stepName: string;
  };
  /** Follow-up suggestions after agent completion */
  followUpSuggestions?: ReadonlyArray<{
    id: string;
    text: string;
    action: string;
  }>;
  /** Extraction review payload (emitted with extraction_review_presented event) */
  extractionReview?: ExtractionReviewPayload;
  /** Chat id assigned to the thread (emitted with chat_created right after the
   * BE has persisted the Chat row so the client can navigate immediately). */
  chatId?: string;
  /** Form patch proposed by an embedded form-editor chat (form_patch event). */
  formPatch?: FormPatchPayload;
}

/**
 * Final response returned by the streaming generator.
 */
export interface AgentStreamResponse {
  status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR' | 'CANCELLED';
  message?: string;
  sources?: SourceCitation[];
  error?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id?: string;
  }>;
}
