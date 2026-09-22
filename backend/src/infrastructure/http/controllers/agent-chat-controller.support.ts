import { DEFAULT_REACT_MODEL, ReactChatModel } from '../../services/agents/dosage_agent_react/graph/DosageReactGraph';
import { type MentionItem, isMentionEntityType } from '../../../domain/dtos/mention.dto';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { PrismaMessageRepository } from '../../repositories/PrismaMessageRepository';
import { AgentResponseStatus as MessageStatus, MessageCost } from '../../../domain/entities/Message';


export type ChatContext = {
  chatRepository: PrismaChatRepository;
  userId: string;
  threadId: string;
  modelName?: ReactChatModel;
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


/**
 * Cost-control override for the ReAct chat model.
 *
 * Why: in production, FE clients pass `modelName: 'gpt-4o'` which makes every
 * chat turn cost 10-16× more than necessary while delivering no measurable
 * quality benefit at the chat-orchestration layer. The expensive sub-agents
 * (search_products, calculate_dosage, flowMatch*) keep their own model.
 */
export function enforceChatModel(requested?: ReactChatModel): ReactChatModel {
  const enforced: ReactChatModel = DEFAULT_REACT_MODEL;
  if (requested && requested !== enforced) {
    console.warn(
      `[AgentChat] Ignoring requested modelName="${requested}" — forcing "${enforced}" for cost control`,
    );
  }
  return enforced;
}


/**
 * Parse mentions input which may arrive as a JSON string (from FormData) or as an array (from JSON body).
 */
export const MAX_MESSAGE_LENGTH = 10_000;

export const MAX_MENTION_ID_LENGTH = 100;

export const MAX_MENTION_LABEL_LENGTH = 200;


export function sanitizeMentionLabel(label: string): string {
  return label
    .replace(/[<>{}]/g, '')
    .trim()
    .slice(0, MAX_MENTION_LABEL_LENGTH);
}


export function validateMentionItem(item: unknown): item is MentionItem {
  if (!item || typeof item !== 'object') return false;
  const m = item as Record<string, unknown>;
  return (
    typeof m.type === 'string' &&
    isMentionEntityType(m.type) &&
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    m.id.length <= MAX_MENTION_ID_LENGTH &&
    typeof m.label === 'string'
  );
}


/**
 * Parse and validate mentions input which may arrive as a JSON string (from FormData) or as an array (from JSON body).
 */
export function parseMentionsInput(raw: string | MentionItem[] | undefined): MentionItem[] | undefined {
  if (!raw) return undefined;

  const items: unknown[] = Array.isArray(raw)
    ? raw
    : (() => {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

  const validated = items.filter(validateMentionItem).map((m) => ({
    type: m.type,
    id: m.id.trim(),
    label: sanitizeMentionLabel(m.label),
  }));

  return validated.length > 0 ? validated : undefined;
}


/**
 * Parse the clientContext field from the request body.
 * In FormData requests it arrives as a JSON-stringified payload; in JSON
 * requests it is already an object. Returns undefined for missing or
 * non-object values so downstream code can safely ignore it.
 */
export function parseClientContextInput(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') {
    return Object.keys(raw).length > 0 ? raw : undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    return Object.keys(record).length > 0 ? record : undefined;
  } catch {
    return undefined;
  }
}
