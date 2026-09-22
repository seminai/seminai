import { BaseMessage } from '@langchain/core/messages';

/**
 * Pending field note data waiting for approval.
 */
export interface PendingFieldNote {
  category: string;
  rawContent: string;
  extractedData: Record<string, unknown>;
  suggestedFieldId?: string;
  suggestedProductIds?: string[];
  suggestedProductionUnitId?: string;
  operationDate?: Date;
  latitude?: number;
  longitude?: number;
  confidence?: number;
  treatedAreaHa?: number;
}

/**
 * In-flight approval state recorded on the sub-agent graph. Mirrors the
 * `pendingAction` shape used by the parent dosage_agent_react, with a fixed
 * `riskLevel` since the field_note agent has no risk classifier yet.
 *
 * The presence of this field gates approve_field_note / reject_field_note
 * idempotently: a missing value means the operation has already been
 * completed (or cancelled) and the caller must be answered with a no-op.
 */
export interface PendingFieldNoteAction {
  tool: string;
  args: Record<string, unknown>;
  description: string;
  requiresApproval: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * State of the field note agent conversation.
 */
export interface AgentState {
  messages: BaseMessage[];
  pendingFieldNote?: PendingFieldNote;
  pendingAction?: PendingFieldNoteAction;
  toolCallCount?: number;
  lastToolCalls?: string[];
}

/**
 * Response status indicating the current state of the agent execution.
 */
export type AgentResponseStatus = 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';

/**
 * Response from the agent after processing a message.
 */
export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
  }>;
  pendingFieldNote?: PendingFieldNote;
  error?: string;
  createdFieldNoteIds?: string[];
  createdStockIds?: string[];
}
