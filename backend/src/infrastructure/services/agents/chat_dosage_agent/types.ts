import { BaseMessage } from '@langchain/core/messages';
import { RuleCategory } from '@prisma/client';

/**
 * Source citation with link and text fragment used in the response.
 */
export interface SourceCitation {
  url: string;
  title: string;
  fragment: string;
}

/**
 * Result item returned by company/public rules search.
 */
export interface CompanyRuleSearchResult {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly ruleCategory: RuleCategory;
  readonly source: 'company' | 'workspace';
  readonly isPublic: boolean;
  readonly score: number;
  readonly chunks: ReadonlyArray<{
    readonly content: string;
    readonly score: number;
    readonly chunkIndex: number;
  }>;
}

/**
 * State interface for the Chat Dosage Agent.
 * Represents the complete state of the agent during conversation execution.
 */
export interface AgentState {
  messages: BaseMessage[];
  currentTask?: string;
  pendingAction?: {
    tool: string;
    args: Record<string, unknown>;
    description: string;
    requiresApproval: boolean;
  };
  sources?: SourceCitation[];
}
