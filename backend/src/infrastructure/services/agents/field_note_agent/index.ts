/**
 * Field Note Agent - AI-powered assistant for field note classification and management.
 *
 * This module provides tools and workflows for:
 * - Classifying free-text field notes into structured data
 * - Finding and suggesting matches with existing fields, production units, and products
 * - Managing the approval workflow for field note creation
 *
 * @example
 * ```typescript
 * import { createFieldNoteAgentApp, handleUserMessage, approveAndExecute } from './field_note_agent';
 * import { prisma } from '../../repositories/Prisma';
 *
 * // Create agent instance
 * const agent = createFieldNoteAgentApp({
 *   userId: 'user-123',
 *   prisma,
 *   modelName: 'gpt-4o',
 * });
 *
 * // Handle user message
 * const response = await handleUserMessage(
 *   agent,
 *   'thread-456',
 *   'ho dato 10 kg di rame nel campo vite'
 * );
 *
 * if (response.status === 'REQUIRES_APPROVAL') {
 *   // User approves the suggested classification
 *   const finalResponse = await approveAndExecute(agent, 'thread-456');
 * }
 * ```
 */

export {
  createFieldNoteAgentApp,
  handleUserMessage,
  approveAndExecute,
  rejectAndRespond,
  getConversationState,
} from './ChatFieldNoteAgent';

export type { FieldNoteAgentApp, CreateFieldNoteAgentAppOptions } from './ChatFieldNoteAgent';

export type { AgentState, AgentResponse, AgentResponseStatus, PendingFieldNote } from './types';

export type { ChatModel } from './graph';

export {
  createClassifyFieldNoteDataTool,
  createFindUserCompaniesTool,
  createFindUserFieldsTool,
  createFindUserProductionUnitsTool,
  createFindUserProductsTool,
  createSaveFieldNoteTool,
  createSaveStockInPurchaseTool,
  createSaveStockInHarvestTool,
  createSaveStockOutSaleTool,
  createExtractGpsFromImageTool,
} from './tools';

export { FieldNoteAgentRegistry, getFieldNoteAgentRegistry } from './FieldNoteAgentRegistry';

export type { GetOrCreateAgentOptions } from './FieldNoteAgentRegistry';

export {
  createBdfSearchProductsByAdversityWithCacheTool,
  createSearchBdfCachedProductsTool,
} from './bdfToolWrappers';

export { BdfProductVectorStore } from './rag';
