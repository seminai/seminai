import { BaseMessage } from '@langchain/core/messages';
import { JobWithAssignmentDTO } from '../../../../domain/dtos/job-assignment.dto';

/**
 * Source citation with link and text fragment used in the response.
 */
export interface SourceCitation {
  url: string;
  title: string;
  description: string;
}

/**
 * Metadata that can be attached to messages (images, links, PDFs)
 */
export interface MessageMetadata {
  images?: string[];
  links?: string[];
  pdfs?: string[];
  [key: string]: unknown;
}

/**
 * Input structure for the job verification chat
 */
export interface JobVerificationInput {
  jobs: JobWithAssignmentDTO[];
  message: string;
  metadata?: MessageMetadata;
}

/**
 * Pending job modification that requires user approval
 */
export interface PendingJobModification {
  jobId: string;
  /** Human-readable name of the job/production unit for display purposes */
  jobName?: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  description: string;
}

/**
 * Task created by the agent to solve the user's request
 */
export interface AgentTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
}

/**
 * Pending action that requires human approval
 */
export interface PendingAction {
  type: 'tool_call' | 'job_modification';
  tool?: string;
  args?: Record<string, unknown>;
  modifications?: PendingJobModification[];
  description: string;
}

/**
 * State interface for the Job Verification Agent.
 * Represents the complete state of the agent during conversation execution.
 */
export interface JobVerificationAgentState {
  messages: BaseMessage[];
  jobs: JobWithAssignmentDTO[];
  tasks: AgentTask[];
  currentTaskId?: string;
  pendingAction?: PendingAction;
  sources: SourceCitation[];
  reasoning?: string;
  finalAnswer?: string;
  requiresHumanInput: boolean;
  metadata?: MessageMetadata;
}

/**
 * Response status indicating the current state of the agent execution.
 */
export type AgentResponseStatus =
  | 'COMPLETED'
  | 'REQUIRES_APPROVAL'
  | 'REQUIRES_MODIFICATION_APPROVAL'
  | 'PROCESSING'
  | 'ERROR';

/**
 * Response from the agent after processing a message.
 */
export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  reasoning?: string;
  pendingAction?: PendingAction;
  sources?: SourceCitation[];
  tasks?: AgentTask[];
  error?: string;
}
