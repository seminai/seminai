import { BaseMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ContextManagerConfig, DEFAULT_CONFIG } from './context-manager.support';
import type { ContextManagerContext } from './context-manager.context';
import { contextManagerCountTokens } from './context-manager.01-count-tokens';
import { contextManagerCountMessageTokens } from './context-manager.02-count-message-tokens';
import { contextManagerCountTotalTokens } from './context-manager.03-count-total-tokens';
import { contextManagerTruncateToolResult } from './context-manager.04-truncate-tool-result';
import { contextManagerTruncateJsonObject } from './context-manager.05-truncate-json-object';
import { contextManagerTruncateArray } from './context-manager.06-truncate-array';
import { contextManagerTruncateObjectValues } from './context-manager.07-truncate-object-values';
import { contextManagerTruncateString } from './context-manager.08-truncate-string';
import { contextManagerTrimMessages } from './context-manager.09-trim-messages';
import { contextManagerCreateTruncatedToolMessage } from './context-manager.10-create-truncated-tool-message';
import { contextManagerTruncateAIMessage } from './context-manager.11-truncate-aimessage';
import { contextManagerNeedsTrimming } from './context-manager.12-needs-trimming';
import { contextManagerGetTokenCount } from './context-manager.13-get-token-count';

export { type ContextManagerConfig } from './context-manager.support';

/**
 * Manages context window to prevent token overflow errors.
 * Provides message trimming, token counting, and tool result truncation.
 */
export class ContextManager {

  config: ContextManagerConfig;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Counts tokens in a string using heuristic estimation
   */
  countTokens(text: string): number {
    return contextManagerCountTokens.call(this as unknown as ContextManagerContext, text);
  }

  /**
   * Counts tokens in a message
   */
  countMessageTokens(message: BaseMessage): number {
    return contextManagerCountMessageTokens.call(this as unknown as ContextManagerContext, message);
  }

  /**
   * Counts total tokens in messages array
   */
  countTotalTokens(messages: BaseMessage[]): number {
    return contextManagerCountTotalTokens.call(this as unknown as ContextManagerContext, messages);
  }

  /**
   * Truncates a tool result to fit within max tokens
   */
  truncateToolResult(content: string, maxTokens?: number): string {
    return contextManagerTruncateToolResult.call(this as unknown as ContextManagerContext, content, maxTokens);
  }

  /**
   * Truncates a JSON object to fit within token limit
   */
  truncateJsonObject(obj: unknown, maxTokens: number): string {
    return contextManagerTruncateJsonObject.call(this as unknown as ContextManagerContext, obj, maxTokens);
  }

  /**
   * Truncates an array to fit within token limit
   */
  truncateArray(arr: unknown[], maxTokens: number): unknown[] {
    return contextManagerTruncateArray.call(this as unknown as ContextManagerContext, arr, maxTokens);
  }

  /**
   * Truncates object values that are too large
   */
  truncateObjectValues(
    obj: Record<string, unknown>,
    maxTokens: number,
  ): Record<string, unknown> {
    return contextManagerTruncateObjectValues.call(this as unknown as ContextManagerContext, obj, maxTokens);
  }

  /**
   * Truncates a string to fit within token limit
   */
  truncateString(text: string, maxTokens: number): string {
    return contextManagerTruncateString.call(this as unknown as ContextManagerContext, text, maxTokens);
  }

  /**
   * Trims messages to fit within context window.
   * Preserves system messages and recent messages.
   * Removes or summarizes old tool results first.
   */
  trimMessages(messages: BaseMessage[]): BaseMessage[] {
    return contextManagerTrimMessages.call(this as unknown as ContextManagerContext, messages);
  }

  /**
   * Creates a truncated version of a tool message
   */
  createTruncatedToolMessage(msg: ToolMessage): ToolMessage {
    return contextManagerCreateTruncatedToolMessage.call(this as unknown as ContextManagerContext, msg);
  }

  /**
   * Truncates an AI message
   */
  truncateAIMessage(msg: AIMessage): AIMessage {
    return contextManagerTruncateAIMessage.call(this as unknown as ContextManagerContext, msg);
  }

  /**
   * Check if context needs trimming
   */
  needsTrimming(messages: BaseMessage[]): boolean {
    return contextManagerNeedsTrimming.call(this as unknown as ContextManagerContext, messages);
  }

  /**
   * Get current token count
   */
  getTokenCount(messages: BaseMessage[]): number {
    return contextManagerGetTokenCount.call(this as unknown as ContextManagerContext, messages);
  }
}

export function createManagedMessageReducer(config?: Partial<ContextManagerConfig>) {
  const contextManager = new ContextManager(config);
  return (existingMessages: BaseMessage[], newMessages: BaseMessage[]): BaseMessage[] => {
    const allMessages = existingMessages.concat(newMessages);
    return contextManager.needsTrimming(allMessages)
      ? contextManager.trimMessages(allMessages)
      : allMessages;
  };
}

let sharedContextManager: ContextManager | null = null;

export function getSharedContextManager(): ContextManager {
  sharedContextManager ??= new ContextManager();
  return sharedContextManager;
}

export function truncateToolResult(content: string, maxTokens?: number): string {
  return getSharedContextManager().truncateToolResult(content, maxTokens);
}
