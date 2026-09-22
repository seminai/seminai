import { AppError } from '../../../domain/errors/AppError';
import { IChatRepository } from '../../../domain/repositories/IChatRepository';
import { IAgentStreamEventRepository } from '../../../domain/repositories/IAgentStreamEventRepository';

export interface GetChatStreamEventsInput {
  readonly threadId: string;
  readonly userId: string;
  readonly sinceSeq: number;
  readonly limit?: number;
}

export interface ChatStreamEventDto {
  readonly seq: number;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

export interface GetChatStreamEventsResult {
  readonly events: readonly ChatStreamEventDto[];
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * Returns the events persisted for a thread with `seq > sinceSeq`, ordered ASC.
 * Used by clients to catch up after a refresh or network blip.
 */
export class GetChatStreamEventsUseCase {
  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly streamEventRepository: IAgentStreamEventRepository,
  ) {}

  async execute(input: GetChatStreamEventsInput): Promise<GetChatStreamEventsResult> {
    const chat = await this.chatRepository.findByThreadIdAndUserId(input.threadId, input.userId);
    if (!chat) {
      const conflicting = await this.chatRepository.findByThreadId(input.threadId);
      if (conflicting) {
        throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
      }
      return { events: [] };
    }
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const rows = await this.streamEventRepository.findByThread(
      input.threadId,
      input.sinceSeq,
      limit,
    );
    return {
      events: rows.map((row) => ({
        seq: row.seq,
        type: row.type,
        payload: row.payload,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
