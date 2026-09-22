export type AgentStreamEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'working_memory_update'
  | 'complete'
  | 'requires_approval'
  | 'loop_warning'
  | 'error'
  | 'plan_step_generated'
  | 'plan_presented'
  | 'plan_step_modified'
  | 'plan_executing'
  | 'plan_step_executed'
  | 'model_selected'
  | 'questionnaire_presented'
  | 'pipeline_progress'
  | 'follow_up_suggestions'
  | 'extraction_review_presented'
  | 'extraction_review_saved'
  | 'extraction_review_cancelled'
  | 'extraction_archived'
  | 'cancelled'
  | 'chat_created'
  | 'form_patch';

import type { DocumentCategory } from '@/types/prisma';

export type ExtractionFieldType = 'text' | 'number' | 'date' | 'textarea' | 'lines';

export interface ExtractionFieldDescriptor {
  readonly key: string;
  readonly labelIt: string;
  readonly type: ExtractionFieldType;
  readonly required: boolean;
  readonly placeholder?: string;
  readonly helpIt?: string;
  /** Only meaningful when type === 'lines': descriptors for each row's columns. */
  readonly lineFields?: readonly ExtractionFieldDescriptor[];
}

export interface ExtractionReviewPayload {
  readonly reviewId: string;
  readonly category: DocumentCategory;
  readonly companyId: string;
  readonly fileName: string;
  readonly fileUrl?: string;
  readonly fields: readonly ExtractionFieldDescriptor[];
  readonly data: Record<string, unknown>;
}

export interface ExtractionArchivedPayload {
  readonly reviewId: string;
  readonly extractionId: string;
  readonly archiveUrl: string;
  readonly fileName: string;
}

export type FormPatchPayload =
  | { readonly action: 'set_unit_fields'; readonly unitIndex: number; readonly fields: Record<string, unknown> }
  | { readonly action: 'add_unit'; readonly unit?: Record<string, unknown> }
  | { readonly action: 'remove_unit'; readonly unitIndex: number }
  | {
      readonly action: 'move_allocation';
      readonly fromUnitIndex: number;
      readonly allocationIndex: number;
      readonly toUnitIndex: number;
      readonly toAllocationIndex?: number;
    };

export interface AgentToolCallPayload {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly id?: string;
}

export interface AgentPipelineProgressPayload {
  readonly currentStep: number;
  readonly totalSteps: number;
  readonly stepName: string;
}

export interface AgentStreamResponsePayload {
  readonly status: 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';
  readonly message?: string;
  readonly error?: string;
  readonly pendingToolCalls?: ReadonlyArray<AgentToolCallPayload>;
}

export interface AgentFollowUpSuggestion {
  readonly id: string;
  readonly text: string;
  readonly action: string;
}

export interface AgentStreamEvent {
  readonly type: AgentStreamEventType;
  readonly content?: string;
  readonly toolCall?: AgentToolCallPayload;
  readonly error?: string;
  readonly response?: AgentStreamResponsePayload;
  readonly riskLevel?: 'low' | 'medium' | 'high';
  readonly pipelineProgress?: AgentPipelineProgressPayload;
  readonly followUpSuggestions?: ReadonlyArray<AgentFollowUpSuggestion>;
  readonly extractionReview?: ExtractionReviewPayload;
  readonly extractionArchived?: ExtractionArchivedPayload;
  readonly chatId?: string;
  readonly formPatch?: FormPatchPayload;
}

export function parseSseDataLines(rawChunk: string): readonly string[] {
  return rawChunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6));
}

export function safeParseEvent(payload: string): AgentStreamEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<AgentStreamEvent>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }
    return parsed as AgentStreamEvent;
  } catch {
    return null;
  }
}
