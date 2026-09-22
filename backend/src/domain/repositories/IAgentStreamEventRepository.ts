import { AgentStreamEvent } from '../entities/AgentStreamEvent';

export interface AppendStreamEventInput {
  readonly threadId: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

export interface IAgentStreamEventRepository {
  /**
   * Appends a new stream event for a thread. The next `seq` is computed
   * inside the implementation from the current maximum for the thread.
   * Returns the persisted event with its assigned `seq`.
   */
  append(input: AppendStreamEventInput): Promise<AgentStreamEvent>;

  /**
   * Lists events for a thread with `seq > sinceSeq`, ordered by `seq` ASC.
   * If `limit` is provided, caps the result size.
   */
  findByThread(
    threadId: string,
    sinceSeq: number,
    limit?: number,
  ): Promise<readonly AgentStreamEvent[]>;

  /**
   * Returns the latest `seq` for a thread, or `null` when no events exist.
   */
  getLatestSeq(threadId: string): Promise<number | null>;

  /**
   * Returns the latest event for a thread, or `null` when no events exist.
   */
  getLatest(threadId: string): Promise<AgentStreamEvent | null>;

  /**
   * Deletes all events for a thread with `seq < beforeSeq`. Used by the
   * cleanup job to compact thread history after a terminal event.
   */
  deleteBeforeSeq(threadId: string, beforeSeq: number): Promise<number>;
}
