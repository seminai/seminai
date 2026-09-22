import type { ChatAttachmentViewModel } from '@/types/chat-attachment';
import type { ExtractionReviewPayload } from '@/lib/agent-chat-events';

export type TransientUserStatus = 'pending' | 'sent' | 'error';

export type TransientAssistantStatus =
  | 'thinking'
  | 'streaming'
  | 'requires_approval'
  | 'error'
  | 'completed'
  | 'cancelled';

export type TransientToolStatus = 'running' | 'completed' | 'error';

export interface TransientUserMessage {
  readonly id: string;
  readonly content: string;
  readonly createdAtIso: string;
  readonly status: TransientUserStatus;
  readonly attachments: readonly ChatAttachmentViewModel[];
}

export interface TransientToolCall {
  readonly id: string;
  readonly name: string;
  readonly labelIt: string;
  readonly status: TransientToolStatus;
  readonly startedAtIso: string;
}

export interface PipelineProgressVm {
  readonly currentStep: number;
  readonly totalSteps: number;
  readonly stepName: string;
}

export interface PendingToolCall {
  readonly id: string;
  readonly name: string;
  readonly labelIt: string;
  readonly riskLevel: 'low' | 'medium' | 'high';
}

export type ExtractionReviewStatus = 'editing' | 'saved' | 'cancelled';

export interface ExtractionReviewState {
  readonly payload: ExtractionReviewPayload;
  readonly status: ExtractionReviewStatus;
}

export interface TransientAssistantMessage {
  readonly id: string;
  readonly createdAtIso: string;
  readonly status: TransientAssistantStatus;
  readonly content: string;
  readonly toolCalls: readonly TransientToolCall[];
  readonly pipelineProgress: PipelineProgressVm | null;
  readonly errorMessage: string | null;
  readonly pendingToolCalls: readonly PendingToolCall[];
  readonly extractionReview: ExtractionReviewState | null;
}
