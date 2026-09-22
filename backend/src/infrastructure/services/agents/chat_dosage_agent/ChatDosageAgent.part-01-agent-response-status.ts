import type { AgentState, SourceCitation } from './types';
import { Runnable } from '@langchain/core/runnables';
import { AgentGraphFactory, ChatModel } from './graph';
import { createJobOperationsVectorStore, JobOperationsVectorStore } from './rag';
import { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../domain/repositories/IStockRepository';
import { DisciplinariPdfVectorStore, BDF_DISCIPLINARI_CATALOG } from './rag/DisciplinariPdfVectorStore';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { prisma } from '../../../repositories/Prisma';

/**
 * Response status indicating the current state of the agent execution.
 */
export type AgentResponseStatus = 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';

/**
 * Response from the agent after processing a message.
 */
export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
  }>;
  sources?: SourceCitation[];
  error?: string;
}

/**
 * Agent app type with state management methods.
 */
export type AgentApp = Runnable & {
  getState: (config: { configurable: { thread_id: string } }) => Promise<{ values: AgentState }>;
  updateState: (
    config: { configurable: { thread_id: string } },
    update: Partial<AgentState>,
  ) => Promise<unknown>;
};

/**
 * Options for creating an agent app.
 */
export interface CreateAgentAppOptions {
  modelName?: ChatModel;
  temperature?: number;
  tavilyApiKey?: string;
  openAIApiKey?: string;
  userId?: string;
  /** Job ID for geographic validation of Tavily search results */
  jobId?: string;
  /** Workspace ID for workspace-level rule search */
  workspaceId?: string;
  /** Thread ID for working memory isolation (required for dosage pipeline tools). */
  threadId?: string;
  /** Pre-initialized vector store for job operations search (optional, will be created if jobId is provided) */
  jobOperationsVectorStore?: JobOperationsVectorStore;
  /** Skip RAG initialization even if jobId is provided */
  skipRAG?: boolean;
  /**
   * When true (default), the agent pauses before every tool call for human approval.
   * Set to false to allow autonomous tool execution — useful for bulk/batch job modifications.
   * @default true
   */
  requireApproval?: boolean;
  /**
   * User display info for attributing AI-assisted job modifications in the job history.
   * Required to enable the update_job and create_job tools.
   */
  userInfo?: { name: string; email: string };
  /**
   * Job repository implementation. Required to enable update_job and create_job tools.
   * When not provided those tools are not added to the agent.
   */
  jobRepository?: IJobRepository;
  /**
   * Stock repository implementation. Required to enable update_job and create_job tools.
   */
  stockRepository?: IStockRepository;
  /**
   * Pre-initialized disciplinari PDF vector store.
   * When not provided a new one is created automatically from the BDF catalog.
   */
  disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  /**
   * Skip creation of the disciplinari PDF vector store.
   * When true the search_disciplinari_bdf_pdf tool is not added.
   * @default false
   */
  skipDisciplinariPdf?: boolean;
}

/**
 * Creates a new agent app instance.
 *
 * Initialization steps (all gracefully degraded on failure):
 * 1. Job Operations RAG — loads and indexes operations for the jobId (if provided and skipRAG=false).
 * 2. Disciplinari PDF Vector Store — creates a lazy store from the BDF catalog (if skipDisciplinariPdf=false).
 * 3. Job modification tools — enabled when userId + userInfo + jobRepository + stockRepository are provided.
 * 4. Approval mode — controlled by requireApproval (default true). Set to false for batch/bulk operations.
 *
 * @param options Configuration options
 * @returns The agent app with state management capabilities
 */
export async function createAgentApp(options: CreateAgentAppOptions = {}): Promise<AgentApp> {
  let jobOperationsVectorStore = options.jobOperationsVectorStore;

  // Initialize job operations RAG if jobId and userId are provided and no vector store is passed
  if (options.jobId && options.userId && !jobOperationsVectorStore && !options.skipRAG) {
    try {
      console.log(`[createAgentApp] Initializing RAG for jobId: ${options.jobId}`);

      const jobRepo = new PrismaJobRepository(prisma);
      const operations = await jobRepo.findManyByUserIdWithAssignmentWithoutHistory(
        options.userId,
        undefined,
        options.jobId,
      );

      if (operations.length > 0) {
        console.log(`[createAgentApp] Found ${operations.length} operations, indexing...`);
        jobOperationsVectorStore = await createJobOperationsVectorStore(operations, options.jobId);
        console.log(`[createAgentApp] RAG initialization complete`);
      } else {
        console.log(`[createAgentApp] No operations found for jobId: ${options.jobId}`);
      }
    } catch (error) {
      console.error(`[createAgentApp] Failed to initialize RAG:`, error);
      // Continue without RAG — don't fail the entire agent creation
    }
  }

  // Initialize disciplinari PDF vector store (lazy — no downloads at boot)
  let disciplinariPdfVectorStore = options.disciplinariPdfVectorStore;
  if (!disciplinariPdfVectorStore && !options.skipDisciplinariPdf) {
    disciplinariPdfVectorStore = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
    console.log(
      `[createAgentApp] Disciplinari PDF vector store ready (${BDF_DISCIPLINARI_CATALOG.length} entries in catalog, lazy fetch)`,
    );
  }

  const factory = new AgentGraphFactory({
    ...options,
    jobOperationsVectorStore,
    disciplinariPdfVectorStore,
  });
  return factory.createGraph();
}
