/**
 * Re-exports search tools from chat_dosage_agent and BDF integrations.
 * These tools are reused as-is in the ReAct agent.
 */

export {
  createTavilyScientificSearchTool,
  createJobOperationsSearchTool,
  createRulesSearchTool,
} from '../../chat_dosage_agent/tools';
export type { RulesSearchToolOptions } from '../../chat_dosage_agent/tools';

export { createDisciplinariDatabaseSearchTool } from '../../chat_dosage_agent/tools';

export { createDisciplinariPdfSearchTool } from '../../chat_dosage_agent/tools-disciplinari-bdf';

export {
  createCachedBdfClient,
  createBdfSearchProductDosesTool,
  createBdfSearchProductsByAdversityTool,
} from '../../../integrations/bdf';

export {
  JobOperationsVectorStore,
  createJobOperationsVectorStore,
  DisciplinariPdfVectorStore,
  BDF_DISCIPLINARI_CATALOG,
} from '../../chat_dosage_agent/rag';

export {
  VectorStoreCache,
  jobOperationsVectorStoreCache,
  disciplinariPdfVectorStoreCache,
  fingerprintOperations,
  fingerprintCatalog,
  getOrCreateJobOperationsVectorStore,
  getOrCreateDisciplinariPdfVectorStore,
} from './vector-store-cache';
