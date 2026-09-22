export {
  createAgentApp,
  handleUserMessage,
  approveAction,
  rejectAction,
  getAgentState,
  extractSourcesFromMessages,
} from './ChatDosageAgent';
export type {
  AgentResponse,
  AgentResponseStatus,
  AgentApp,
  CreateAgentAppOptions,
} from './ChatDosageAgent';
export { AgentGraphFactory, VALID_CHAT_MODELS, DESTRUCTIVE_TOOLS } from './graph';
export type { ChatModel } from './graph';
export type { AgentState, SourceCitation, CompanyRuleSearchResult } from './types';
export {
  createTavilyScientificSearchTool,
  createJobOperationsSearchTool,
  createRulesSearchTool,
} from './tools';
export type { RulesSearchToolOptions } from './tools';
export { createUpdateJobTool, createAddJobTool } from './tools-job-modification';
export type { JobModificationToolOptions } from './tools-job-modification';
export { createOptimizeSelectedJobsTool } from './tools-job-optimization';
export { createMergeTreatmentDatesTool } from './tools-job-merge';
export { createDisciplinariPdfSearchTool } from './tools-disciplinari-bdf';
export {
  createSearchCompanyStockTool,
  createListProductionUnitsTool,
} from './tools-stock-production';
export { createCheckProductCropAuthorizationsTool } from './tools-product-labels';
export { streamAgentChat } from './streaming';
export type { StreamEvent, StreamEventType, StreamAgentOptions } from './streaming';

// RAG exports
export {
  JobOperationsVectorStore,
  createJobOperationsVectorStore,
  buildOperationText,
  buildOperationDocument,
  DisciplinariPdfVectorStore,
  BDF_DISCIPLINARI_CATALOG,
} from './rag';
export type {
  JobOperationDocument,
  JobOperationMetadata,
  JobOperationSearchResult,
  RAGConfig,
  DisciplinareEntry,
  DisciplinareChunk,
  DisciplinareSearchResult,
} from './rag';
