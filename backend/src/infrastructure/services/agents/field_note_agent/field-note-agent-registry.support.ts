/**
 * Field Note Agent Registry
 *
 * Manages agent app instances and persists conversation history to Prisma.
 * Solves the problem of losing conversation context between HTTP requests
 * by maintaining a cache of agent apps keyed by threadId.
 */

/**
 * Field Note Agent Registry
 *
 * Manages agent app instances and persists conversation history to Prisma.
 * Solves the problem of losing conversation context between HTTP requests
 * by maintaining a cache of agent apps keyed by threadId.
 */
import { PrismaClient } from '@prisma/client';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { ChatModel } from './graph';
import { BdfProductVectorStore } from './rag';
import type { PendingFieldNoteAction } from './types';


/**
 * Cached agent app entry with metadata.
 */
export interface CachedAgentEntry {
  app: FieldNoteAgentApp;
  userId: string;
  chatId: string;
  lastActivity: Date;
  modelName: ChatModel;
  bdfProductVectorStore: BdfProductVectorStore | null;
}


export interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}


export const SAVE_TOOL_NAMES = new Set([
  'save_field_note',
  'save_stock_in_purchase',
  'save_stock_in_harvest',
  'save_stock_out_sale',
  'save_stock_out_treatment',
]);


export function buildPendingAction(messages: readonly BaseMessage[]): PendingFieldNoteAction | undefined {
  const lastMessage = messages[messages.length - 1] as
    | (AIMessage & {
        tool_calls?: Array<{ name: string; args: Record<string, unknown> }>;
      })
    | undefined;
  const toolCall = lastMessage?.tool_calls?.find((tc) => SAVE_TOOL_NAMES.has(tc.name));
  if (!toolCall) return undefined;
  return {
    tool: toolCall.name,
    args: toolCall.args,
    description: `Esecuzione ${toolCall.name}`,
    requiresApproval: true,
    riskLevel: 'medium',
  };
}


/**
 * Options for getting or creating an agent app.
 */
export interface GetOrCreateAgentOptions {
  threadId: string;
  userId: string;
  prisma: PrismaClient;
  modelName?: ChatModel;
  temperature?: number;
}
