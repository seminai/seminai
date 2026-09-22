import { AppError } from '../../../domain/errors/AppError';
import { IChatRepository } from '../../../domain/repositories/IChatRepository';
import { IAgentRunRegistry } from '../../../domain/services/IAgentRunRegistry';

export interface CancelAgentRunInput {
  readonly threadId: string;
  readonly userId: string;
}

export interface CancelAgentRunResult {
  readonly aborted: boolean;
}

/**
 * Aborts the in-flight agent stream for a thread, after verifying ownership.
 *
 * If no run is active for the thread, returns `aborted: false` without
 * raising — the caller may treat this as a no-op (e.g. the stream already
 * finished or never started).
 */
export class CancelAgentRunUseCase {
  constructor(
    private readonly chatRepository: IChatRepository,
    private readonly agentRunRegistry: IAgentRunRegistry,
  ) {}

  async execute(input: CancelAgentRunInput): Promise<CancelAgentRunResult> {
    const chat = await this.chatRepository.findByThreadIdAndUserId(input.threadId, input.userId);
    if (!chat) {
      const conflicting = await this.chatRepository.findByThreadId(input.threadId);
      if (conflicting) {
        throw AppError.forbidden('Not authorized for this chat', 'CHAT_FORBIDDEN');
      }
      return { aborted: false };
    }
    const aborted = this.agentRunRegistry.abort(input.threadId);
    return { aborted };
  }
}
