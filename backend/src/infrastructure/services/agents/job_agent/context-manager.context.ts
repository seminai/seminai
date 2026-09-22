import { BaseMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ContextManagerConfig } from './context-manager.support';

export interface ContextManagerContext {
  config: ContextManagerConfig;
  countTokens(text: string): number;
  countMessageTokens(message: BaseMessage): number;
  countTotalTokens(messages: BaseMessage[]): number;
  truncateToolResult(content: string, maxTokens?: number): string;
  truncateJsonObject(obj: unknown, maxTokens: number): string;
  truncateArray(arr: unknown[], maxTokens: number): unknown[];
  truncateObjectValues(obj: Record<string, unknown>, maxTokens: number): Record<string, unknown>;
  truncateString(text: string, maxTokens: number): string;
  trimMessages(messages: BaseMessage[]): BaseMessage[];
  createTruncatedToolMessage(msg: ToolMessage): ToolMessage;
  truncateAIMessage(msg: AIMessage): AIMessage;
  needsTrimming(messages: BaseMessage[]): boolean;
  getTokenCount(messages: BaseMessage[]): number;
}
