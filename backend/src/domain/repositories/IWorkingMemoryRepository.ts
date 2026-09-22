/**
 * Repository interface for persisting agent working memory.
 */
export interface IWorkingMemoryRepository {
  /** Loads persisted working memory for a thread, or null if none exists. */
  load(threadId: string): Promise<Record<string, unknown> | null>;
  /** Saves (upserts) the serializable subset of working memory. */
  save(threadId: string, data: Record<string, unknown>): Promise<void>;
  /** Deletes persisted working memory for a thread. */
  delete(threadId: string): Promise<void>;
}
