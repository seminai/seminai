/**
 * RAG (Retrieval Augmented Generation) module for the Chat Dosage Agent.
 *
 * This module provides semantic search capabilities over job operations
 * and official Italian disciplinari PDF documents.
 */

export {
  JobOperationsVectorStore,
  createJobOperationsVectorStore,
} from './JobOperationsVectorStore';

export {
  buildOperationText,
  buildOperationDocument,
  buildOperationDocuments,
  extractOperationMetadata,
} from './operationTextBuilder';

export type {
  JobOperationDocument,
  JobOperationMetadata,
  JobOperationSearchResult,
  RAGConfig,
  RAGIndexStats,
} from './types';

export { DEFAULT_RAG_CONFIG } from './types';

export { DisciplinariPdfVectorStore, BDF_DISCIPLINARI_CATALOG } from './DisciplinariPdfVectorStore';
export type {
  DisciplinareEntry,
  DisciplinareChunk,
  DisciplinareSearchResult,
} from './DisciplinariPdfVectorStore';
