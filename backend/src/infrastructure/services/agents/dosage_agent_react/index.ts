/**
 * Dosage ReAct Agent
 *
 * A ReAct (Reason → Act → Observe) agent for agronomists managing phytopharmaceuticals.
 * Combines computation tools from dosage_agent with search tools from chat_dosage_agent
 * in an interactive, step-by-step reasoning loop.
 *
 * Key features:
 * - 13 computation tools (product matching, dosage calculation, compliance validation, etc.)
 * - 3 context discovery tools (company listing, production units, warehouse products)
 * - 6 search tools (Tavily, disciplinari DB, BDF, rules, PDF)
 * - Working memory for chaining tool results
 * - Loop detection to prevent infinite agent loops
 * - Approval gates for destructive operations (job creation)
 * - Streaming support with real-time events
 * - Cost tracking and credit deduction
 */

// Main agent functions
export {
  createReactAgent,
  handleUserMessage,
  approveAction,
  rejectAction,
  getAgentState,
  resetThread,
  extractSourcesFromMessages,
  getCachedAgentApp,
  cacheAgentApp,
  evictAgentApp,
  stopAgentCacheCleanup,
} from './DosageReactAgent';

export type {
  AgentResponse,
  AgentResponseStatus,
  AgentApp,
  CreateReactAgentOptions,
} from './DosageReactAgent';

// Graph factory
export { DosageReactGraphFactory, VALID_REACT_MODELS } from './graph/DosageReactGraph';
export type { ReactChatModel, DosageReactGraphOptions } from './graph/DosageReactGraph';

// Streaming
export { streamReactAgent } from './streaming';
export type { StreamReactAgentOptions } from './streaming';

// Checkpoint history
export type {
  CheckpointHistoryEntry,
  CheckpointHistoryResponse,
  CheckpointStatePreview,
} from './type/checkpoint-history';
export { getThreadHistory } from './persistence/thread-history.service';

// Time-travel
export { forkBeforeGuard } from './graph/fork-at-rejection';
export type { ForkResult } from './graph/fork-at-rejection';

// Types
export type { DosageReactState, WorkingMemory } from './type/state';
export type { StreamEvent, StreamEventType, AgentStreamResponse } from './type/events';
export type { InputDosageAgent } from './type/inputDosageAgent';
export type { Questionnaire, Question, QuestionOption, QuestionType } from './type/questionnaire';

// Working memory
export {
  getWorkingMemory,
  updateWorkingMemory,
  updateWorkingMemoryAsync,
  withWorkingMemoryLock,
  clearWorkingMemory,
  evictWorkingMemoryFromCache,
  hasWorkingMemoryData,
} from './working-memory';

// Loop detection
export { LoopDetector } from './loop-detector';
export type { LoopDetectorConfig, LoopStatus } from './loop-detector';

// Tool registry
export { DESTRUCTIVE_TOOLS } from './tools/create-jobs.tool';

// Context discovery tools
export {
  createListUserCompaniesTool,
  createListProductionUnitsTool,
  createListCompanyProductsTool,
} from './tools';

// Field note delegation tools
export {
  createDelegateToFieldNoteTool,
  createApproveFieldNoteTool,
  createRejectFieldNoteTool,
} from './tools';

// Product label database search
export { createSearchProductLabelDatabaseTool } from './tools';

// Dosage agent full-pipeline launcher
export { createStartDosageAgentJobTool } from './tools';

// Entity creation tools
export {
  createCreateCompanyTool,
  createCreateFieldsTool,
  createCreateProductionUnitsTool,
  createListUserFieldsTool,
  createExtractFromFileTool,
  createImportFromFileTool,
  createImportStockFromFileTool,
} from './tools';
