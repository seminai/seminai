import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { AgentResponseStatus as MessageStatus, MessageCost } from '../../../domain/entities/Message';


export type ChatContext = {
  chatRepository: PrismaChatRepository;
  userId: string;
  threadId: string;
  modelName?: string;
  temperature?: number;
};


export type MessageContext = {
  messageRepository: PrismaMessageRepository;
  chatId: string;
  content: string;
  metadata?: Record<string, unknown>;
};


export type AssistantMessageContext = MessageContext & {
  status: MessageStatus;
  pendingToolCalls?: Array<Record<string, unknown>>;
  error?: string;
  cost?: MessageCost;
};


export type PendingModificationRecord = {
  jobId: string;
  jobName?: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
};


/**
 * Numeric fields on a Job that must be stored as Float, not string.
 * The LLM may return values like "1.53 L" or "2.00" — we parse the numeric part.
 */
export const NUMERIC_JOB_FIELDS = new Set([
  'quantity',
  'treatedSurface',
  'productQuantityTreated',
  'totalDistributedWaterL',
]);


/**
 * Sanitizes a field value before persisting it.
 * For known numeric fields, extracts the numeric part from strings (e.g. "1.53 L" → 1.53).
 */
export function sanitizeFieldValue(field: string, value: unknown): unknown {
  if (!NUMERIC_JOB_FIELDS.has(field)) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(',', '.'));
    if (!isNaN(parsed)) return parsed;
  }
  return value;
}
