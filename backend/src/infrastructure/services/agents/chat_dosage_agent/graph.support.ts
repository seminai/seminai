import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { type ChatModelName } from '../../llm-model-validation';


export const usageLogger = LlmUsageLogger.getInstance();


/**
 * Tool names that modify data and require explicit user approval before execution.
 * Read-only tools (search, list, get) execute automatically without approval.
 */
export const DESTRUCTIVE_TOOLS = new Set([
  'update_job',
  'create_job',
  'optimize_selected_jobs',
  'merge_treatment_dates',
  'create_treatment_jobs',
]);


export type ChatModel = ChatModelName;
