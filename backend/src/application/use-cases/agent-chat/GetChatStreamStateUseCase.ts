import { AppError } from '../../../domain/errors/AppError';
import { IChatRepository } from '../../../domain/repositories/IChatRepository';
import { IAgentStreamEventRepository } from '../../../domain/repositories/IAgentStreamEventRepository';

export interface GetChatStreamStateInput {
  readonly threadId: string;
  readonly userId: string;
}

export type ChatStreamLastStatus =
  | 'streaming'
  | 'completed'
  | 'error'
  | 'cancelled'
  | 'requires_approval';

export interface GetChatStreamStateResult {
  readonly chatId: string | null;
  readonly isStreaming: boolean;
  readonly lastSeq: number;
  readonly lastEventAt: string | null;
  readonly lastStatus: ChatStreamLastStatus | null;
}

const TERMINATOR_TYPES: ReadonlySet<string> = new Set([
  'complete',
  'error',
  'cancelled',
  // Human approval is a wait state, not an active stream. Keeping it non-streaming
  // prevents restored clients from disabling the Approve/Reject controls.
  'requires_approval',
]);

/**
 * Returns the current resumption state for a chat thread:
 * whether a stream is still in flight, the latest persisted seq, and a
 * coarse classification of the last event (used by the client to decide
 * whether to display loading vs. final state).
 */
export class GetChatStreamStateUseCase {
  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly streamEventRepository: IAgentStreamEventRepository,
  ) {}

  async execute(input: GetChatStreamStateInput): Promise<GetChatStreamStateResult> {
    const chat = await this.chatRepository.findByThreadIdAndUserId(input.threadId, input.userId);
    if (!chat) {
      const conflicting = await this.chatRepository.findByThreadId(input.threadId);
      if (conflicting) {
        throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
      }
      return { chatId: null, isStreaming: false, lastSeq: 0, lastEventAt: null, lastStatus: null };
    }
    const latest = await this.streamEventRepository.getLatest(input.threadId);
    if (!latest) {
      return {
        chatId: chat.id,
        isStreaming: false,
        lastSeq: 0,
        lastEventAt: null,
        lastStatus: null,
      };
    }
    const lastStatus = this.mapLastStatus(latest.type);
    return {
      chatId: chat.id,
      isStreaming: !TERMINATOR_TYPES.has(latest.type),
      lastSeq: latest.seq,
      lastEventAt: latest.createdAt.toISOString(),
      lastStatus,
    };
  }

  private mapLastStatus(eventType: string): ChatStreamLastStatus {
    if (eventType === 'complete') return 'completed';
    if (eventType === 'error') return 'error';
    if (eventType === 'cancelled') return 'cancelled';
    if (eventType === 'requires_approval') return 'requires_approval';
    return 'streaming';
  }
}
