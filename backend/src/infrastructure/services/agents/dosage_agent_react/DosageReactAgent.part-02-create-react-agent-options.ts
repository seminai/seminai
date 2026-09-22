import { DosageReactGraphFactory, ReactChatModel } from './graph/DosageReactGraph';
import { JobOperationsVectorStore, DisciplinariPdfVectorStore, BDF_DISCIPLINARI_CATALOG, getOrCreateJobOperationsVectorStore, getOrCreateDisciplinariPdfVectorStore } from './search-tools';
import type { DosageAgentContext } from '../dosage_agent/context';
import type { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import type { IStockRepository } from '../../../../domain/repositories/IStockRepository';
import { type ToolBundle } from './graph/tool-registry';
import type { AgentPromptDomain } from './prompt/system-prompt';
import { type ModelProvider } from '../shared/modelRouter';
import { getWorkingMemory, hydrateWorkingMemory, updateWorkingMemory } from './working-memory';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { prisma } from '../../../repositories/Prisma';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import { AgentMemoryService } from './memory/agent-memory.service';
import { restoreThreadStateFromDatabase } from './persistence/thread-state-recovery';
import { getConversationDurability } from './graph/durability-policy';
import { cancelPendingToolCalls } from './graph/pending-tool-cancellation';
import { DosageReactState } from './type/state';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { buildPendingToolCallsForDisplay } from './approval-display';
import { buildProposalSummary } from './proposal-summary';
import { guardAgainstDuplicateQuestion } from './duplicate-question-guard';
import { AgentApp, AgentResponse, agentAppCache, buildAgentRunConfig, buildCacheConfig, cacheAgentApp, canReuseCachedAgent, consumeStream } from './DosageReactAgent.part-01-agent-response-status';
import { extractSourcesFromMessages } from './DosageReactAgent.part-03-with-proposal-summary';

// ── Creation Options ──

export interface CreateReactAgentOptions {
  threadId: string;
  modelName?: ReactChatModel;
  temperature?: number;
  openAIApiKey?: string;
  tavilyApiKey?: string;
  userId?: string;
  jobId?: string;
  workspaceId?: string;
  jobOperationsVectorStore?: JobOperationsVectorStore;
  disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  skipRAG?: boolean;
  skipDisciplinariPdf?: boolean;
  requireApproval?: boolean;
  context?: DosageAgentContext;
  /** Initial products to load into working memory */
  initialProducts?: unknown[];
  /** Initial production units to load into working memory */
  initialUnits?: unknown[];
  /** User info for job management tools (history tracking) */
  userInfo?: { name: string; email: string };
  /** Job repository for job management tools */
  jobRepository?: IJobRepository;
  /** Stock repository for job management tools */
  stockRepository?: IStockRepository;
  /** Client-driven context (e.g. embedded form-editor mode). Plumbed to tool registry. */
  clientContext?: Record<string, unknown>;
  /**
   * Explicit tool-bundle override. When omitted, the graph picks DOSAGE if jobId
   * is set, FULL otherwise. Reserved for tests and future intent-classifier work.
   */
  toolBundle?: ToolBundle;
  /** Agent domain. MANUFACTURING selects the manufacturing persona + tool set. Defaults to DOSAGE. */
  domain?: AgentPromptDomain;
  /**
   * Preferred LLM provider. When set, routes through the model router instead of
   * direct OpenAI. Included in the cache key so switching providers mid-session
   * rebuilds the graph.
   */
  preferredProvider?: ModelProvider;
}

// ── Agent Creation ──

/**
 * Creates a new Dosage ReAct Agent instance.
 *
 * @param options Configuration options
 * @returns Compiled agent app with state management
 */
export async function createReactAgent(options: CreateReactAgentOptions): Promise<AgentApp> {
  const cachedEntry = agentAppCache.get(options.threadId);
  if (cachedEntry) {
    if (canReuseCachedAgent(cachedEntry, options)) {
      cachedEntry.lastAccessedAt = Date.now();
      await hydrateWorkingMemory(options.threadId);
      if (options.initialProducts || options.initialUnits) {
        updateWorkingMemory(options.threadId, {
          inputProducts: options.initialProducts,
          inputUnits: options.initialUnits,
        });
      }
      return cachedEntry.app;
    }
    // Rebuild the graph for this thread without dropping thread-scoped working memory.
    agentAppCache.delete(options.threadId);
  }

  await hydrateWorkingMemory(options.threadId);

  let jobOperationsVectorStore = options.jobOperationsVectorStore;

  // Initialize job operations RAG if jobId and userId are provided.
  // The shared cache reuses an already-embedded store across agent-app
  // rebuilds when the operations fingerprint (id + updatedAt) is unchanged.
  if (options.jobId && options.userId && !jobOperationsVectorStore && !options.skipRAG) {
    try {
      const jobRepo = new PrismaJobRepository(prisma);
      const operations = await jobRepo.findManyByUserIdWithAssignmentWithoutHistory(
        options.userId,
        undefined,
        options.jobId,
      );

      if (operations.length > 0) {
        jobOperationsVectorStore = await getOrCreateJobOperationsVectorStore({
          jobId: options.jobId,
          operations,
        });
        console.log(`[DosageReactAgent] RAG ready (${operations.length} operations, cached store)`);
      }
    } catch (error) {
      console.error(`[DosageReactAgent] Failed to initialize RAG:`, error);
    }
  }

  // Disciplinari PDF vector store: stored process-wide; subsequent threads
  // reuse already-fetched/embedded PDFs instead of re-downloading and re-embedding.
  let disciplinariPdfVectorStore = options.disciplinariPdfVectorStore;
  if (!disciplinariPdfVectorStore && !options.skipDisciplinariPdf) {
    disciplinariPdfVectorStore = getOrCreateDisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
  }

  // Initialize working memory with initial data if provided
  if (options.initialProducts || options.initialUnits) {
    updateWorkingMemory(options.threadId, {
      inputProducts: options.initialProducts,
      inputUnits: options.initialUnits,
    });
  }

  // Auto-provide repositories if userId is set but repositories are not provided
  const jobRepository =
    options.jobRepository ?? (options.userId ? new PrismaJobRepository(prisma) : undefined);
  const stockRepository =
    options.stockRepository ?? (options.userId ? new PrismaStockRepository(prisma) : undefined);

  // Resolve chatId for task planner tool persistence
  let chatId: string | undefined;
  try {
    const chat = await prisma.chat.findUnique({
      where: { threadId: options.threadId },
      select: { id: true },
    });
    chatId = chat?.id;
  } catch {
    // chatId is optional; if lookup fails, task planner won't be registered
  }

  // Load persistent memories at session start
  if (options.userId) {
    try {
      const memoryService = new AgentMemoryService();
      const memories = await memoryService.loadRelevantMemories(options.userId, { limit: 15 });
      if (memories.length > 0) {
        const memoryContext = memoryService.formatForPrompt(memories);
        if (memoryContext) {
          const memoryUpdate: Parameters<typeof updateWorkingMemory>[1] = { memoryContext };
          if (options.initialProducts) {
            memoryUpdate.inputProducts = options.initialProducts;
          }
          updateWorkingMemory(options.threadId, memoryUpdate);
          console.log(
            `[DosageReactAgent] Loaded ${memories.length} memories for user ${options.userId}`,
          );
        }
      }
    } catch (error) {
      console.error('[DosageReactAgent] Failed to load memories:', error);
    }
  }

  // Build graph
  const factory = new DosageReactGraphFactory({
    ...options,
    chatId,
    jobOperationsVectorStore,
    disciplinariPdfVectorStore,
    jobRepository,
    stockRepository,
  });

  const { app, checkpointer } = await factory.createGraph();
  await restoreThreadStateFromDatabase(app as AgentApp, options.threadId);

  // Cache instance so subsequent calls (next message, approve, reject) reuse it
  cacheAgentApp(options.threadId, app as AgentApp, buildCacheConfig(options), checkpointer);

  return app;
}

// ── Message Handling ──

/**
 * Handles a user message in the ReAct agent conversation.
 * The agent will reason step-by-step, calling tools as needed.
 */
export async function handleUserMessage(
  app: AgentApp,
  threadId: string,
  userMessage: string,
): Promise<AgentResponse> {
  try {
    const config = await buildAgentRunConfig(app, threadId, getConversationDurability());
    // If the graph was paused at approval_gate (pending tool_calls in the last
    // AIMessage), inject synthetic cancellation ToolMessages so the new
    // HumanMessage below doesn't produce an invalid OpenAI sequence
    // (AIMessage[tool_calls] → HumanMessage → INVALID_TOOL_RESULTS). Mirrors
    // the streaming.ts cleanup so both REST and SSE paths are robust.
    await cancelPendingToolCalls({
      app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
      config: { configurable: { thread_id: threadId } },
      reason: 'Nuovo messaggio utente ricevuto durante attesa di approvazione.',
    });

    const inputs: Partial<DosageReactState> = {
      messages: [new HumanMessage(userMessage)],
      loopCounter: 0,
      lastToolCalls: [],
      lastToolCallRecords: [],
    };

    const stream = await app.stream(inputs, config);
    await consumeStream(stream);

    const stateSnapshot = await app.getState(config);
    const lastMessage = stateSnapshot.values.messages[
      stateSnapshot.values.messages.length - 1
    ] as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    };

    // Check if approval is needed
    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      const firstToolName = lastMessage.tool_calls[0].name;
      return {
        status: 'REQUIRES_APPROVAL',
        message: `L'agente richiede approvazione per eseguire: ${firstToolName}`,
        pendingToolCalls: buildPendingToolCallsForDisplay(threadId, lastMessage.tool_calls),
        proposalSummary: buildProposalSummary(threadId, firstToolName),
      };
    }

    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;
    const responseMessage = guardAgainstDuplicateQuestion(
      stateSnapshot.values.messages,
      lastAIMessage?.content?.toString() || 'Nessuna risposta generata',
    );

    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
    const questionnaire = getWorkingMemory(threadId).pendingQuestionnaire;

    return {
      status: 'COMPLETED',
      message: responseMessage,
      sources,
      questionnaire,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    return {
      status: 'ERROR',
      error: `Errore nel processare il messaggio: ${errorMessage}`,
    };
  }
}
