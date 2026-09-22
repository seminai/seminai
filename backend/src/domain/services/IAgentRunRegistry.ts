/**
 * Abstraction for the in-process registry that tracks active agent stream runs.
 *
 * Used by application layer (e.g. CancelAgentRunUseCase) to signal cancellation
 * to an in-flight stream without depending on infrastructure details.
 */
export interface IAgentRunRegistry {
  /**
   * Aborts the active run for a given thread.
   * Returns true if a run was found and aborted, false otherwise.
   */
  abort(threadId: string): boolean;

  /**
   * Checks whether a run is currently active for a given thread.
   */
  isActive(threadId: string): boolean;
}
