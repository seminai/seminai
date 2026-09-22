/**
 * Re-exports the shared cancelPendingToolCalls utility.
 * Kept for backward compatibility — all existing imports continue to work.
 */
export {
  cancelPendingToolCalls,
  type CancelPendingToolCallsOptions,
} from '../../shared/hitl/cancel-pending-tool-calls';
