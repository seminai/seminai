import { Runnable, type RunnableConfig } from '@langchain/core/runnables';
import type { StreamMode, StateSnapshot } from '@langchain/langgraph';
import type { CheckpointListOptions } from '@langchain/langgraph-checkpoint';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import {
  DEFAULT_REACT_MODEL,
  DosageReactGraphFactory,
  ReactChatModel,
} from './graph/DosageReactGraph';
import { resolveToolBundle, type ToolBundle } from './graph/tool-registry';
import type { AgentPromptDomain } from './prompt/system-prompt';
import { computeReactRuntimeBudget } from './graph/react-runtime-budget';
import { DosageReactState } from './type/state';
import { SourceCitation } from '../chat_dosage_agent/types';
import {
  JobOperationsVectorStore,
  DisciplinariPdfVectorStore,
  BDF_DISCIPLINARI_CATALOG,
  getOrCreateJobOperationsVectorStore,
  getOrCreateDisciplinariPdfVectorStore,
} from './search-tools';
import {
  clearWorkingMemory,
  evictWorkingMemoryFromCache,
  getWorkingMemory,
  hydrateWorkingMemory,
  updateWorkingMemory,
} from './working-memory';
import { AgentMemoryService } from './memory/agent-memory.service';
import { prisma } from '../../../repositories/Prisma';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import type { DosageAgentContext } from '../dosage_agent/context';
import type { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import type { IStockRepository } from '../../../../domain/repositories/IStockRepository';
import type { Questionnaire } from './type/questionnaire';
import { restoreThreadStateFromDatabase } from './persistence/thread-state-recovery';
import { getApprovalDurability, getConversationDurability } from './graph/durability-policy';
import { AgentCacheConfig, canReuseCachedAgentConfig } from './agent-cache-config';
import { resolveModelRoutingFingerprint, type ModelProvider } from '../shared/modelRouter';
import { buildPendingToolCallsForDisplay } from './approval-display';
import { createChatEmitter } from './socket/chat-socket-emitter';
import { emitAutoContinueProgress } from './approval-helpers';
import { forkBeforeGuard } from './graph/fork-at-rejection';
import { hitlApprove } from '../shared/hitl/approve-action';
import { hitlReject } from '../shared/hitl/reject-action';
import { cancelPendingToolCalls } from './graph/pending-tool-cancellation';
import { dosageRiskPolicy, type RiskLevel } from './graph/risk-classifier';
import { buildProposalSummary, type ProposalSummary } from './proposal-summary';
import { guardAgainstDuplicateQuestion } from './duplicate-question-guard';

// ── Response Types ──

export type AgentResponseStatus = 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR' | 'CANCELLED';

export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id?: string;
    riskLevel?: RiskLevel;
    riskScore?: number;
    riskReason?: string;
  }>;
  /**
   * Structured preview of what the first pending tool call would do.
   * Populated only when the tool supports a dry-run summary (e.g. create_treatment_jobs).
   * Lets external API/MCP consumers render proposals deterministically without
   * parsing the free-text agent message.
   */
  proposalSummary?: ProposalSummary;
  sources?: SourceCitation[];
  questionnaire?: Questionnaire;
  error?: string;
}

export type AgentApp = Runnable & {
  stream: (
    input: unknown,
    options?: RunnableConfig & {
      streamMode?: StreamMode | StreamMode[];
      durability?: string;
      signal?: AbortSignal;
    },
  ) => Promise<AsyncIterable<unknown>>;
  getState: (config: {
    configurable: { thread_id: string };
  }) => Promise<{ values: DosageReactState }>;
  getStateHistory: (
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ) => AsyncIterableIterator<StateSnapshot>;
  updateState: (
    config: { configurable: { thread_id: string } },
    update: Partial<DosageReactState> | Record<string, unknown>,
    asNode?: string,
  ) => Promise<RunnableConfig>;
};

/**
 * Emits the `pendingAction: null` clear sentinel onto the thread state.
 * The reducer in `graph/graph-state.ts` translates `null` into `undefined`,
 * removing any stale value left over from a previous approval cycle.
 * Tolerates checkpointer write failures because the next normal turn would
 * overwrite anyway; we just log and continue.
 */
async function clearPendingActionState(
  app: AgentApp,
  config: { configurable: { thread_id: string } },
): Promise<void> {
  try {
    await app.updateState(config, { pendingAction: null });
  } catch (error) {
    console.warn(
      `[clearPendingActionState] Failed to clear pendingAction for thread ${config.configurable.thread_id}:`,
      error,
    );
  }
}

async function consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const event of stream) {
    void event;
  }
}

// ── AgentApp Instance Cache ──

interface CachedAgentApp {
  app: AgentApp;
  checkpointer?: import('@langchain/langgraph').BaseCheckpointSaver;
  lastAccessedAt: number;
  config: AgentCacheConfig;
}

const AGENT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const AGENT_CACHE_MAX_ENTRIES = 200;
const agentAppCache = new Map<string, CachedAgentApp>();

let agentCacheCleanupTimer: ReturnType<typeof setInterval> | null = null;

function isToolBundle(value: string | undefined): value is ToolBundle {
  return value === 'DOSAGE' || value === 'FULL' || value === 'MANUFACTURING';
}

async function buildAgentRunConfig(
  app: AgentApp,
  threadId: string,
  durability: string,
): Promise<{
  configurable: { thread_id: string };
  recursionLimit: number;
  durability: string;
}> {
  const baseConfig = { configurable: { thread_id: threadId } };
  const state = await app.getState(baseConfig).catch(() => undefined);
  const cachedBundle = agentAppCache.get(threadId)?.config.toolBundle;
  const runtimeBudget = computeReactRuntimeBudget({
    toolBundle: isToolBundle(cachedBundle) ? cachedBundle : undefined,
    taskList: state?.values.taskList ?? [],
  });
  return {
    ...baseConfig,
    recursionLimit: runtimeBudget.recursionLimit,
    durability,
  };
}

function evictStaleAgentApps(): void {
  const now = Date.now();
  const toDelete: string[] = [];
  for (const [threadId, entry] of agentAppCache) {
    if (now - entry.lastAccessedAt > AGENT_CACHE_TTL_MS) {
      toDelete.push(threadId);
    }
  }
  for (const threadId of toDelete) {
    agentAppCache.delete(threadId);
    evictWorkingMemoryFromCache(threadId);
  }
  if (agentAppCache.size > AGENT_CACHE_MAX_ENTRIES) {
    const sorted = [...agentAppCache.entries()].sort(
      (a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
    );
    const toRemove = sorted.slice(0, agentAppCache.size - AGENT_CACHE_MAX_ENTRIES);
    for (const [threadId] of toRemove) {
      agentAppCache.delete(threadId);
      evictWorkingMemoryFromCache(threadId);
    }
  }
}

function ensureAgentCacheCleanup(): void {
  if (agentCacheCleanupTimer) return;
  agentCacheCleanupTimer = setInterval(evictStaleAgentApps, 5 * 60 * 1000);
  if (
    agentCacheCleanupTimer &&
    typeof agentCacheCleanupTimer === 'object' &&
    'unref' in agentCacheCleanupTimer
  ) {
    agentCacheCleanupTimer.unref();
  }
}

/**
 * Retrieves a cached AgentApp for the given threadId, or returns undefined.
 */
export function getCachedAgentApp(threadId: string): AgentApp | undefined {
  const entry = agentAppCache.get(threadId);
  if (!entry) return undefined;
  entry.lastAccessedAt = Date.now();
  return entry.app;
}

function extractFormMode(clientContext?: Record<string, unknown>): string | undefined {
  const value = clientContext?.formMode;
  return typeof value === 'string' ? value : undefined;
}

function buildCapabilityFingerprint(options: CreateReactAgentOptions): string {
  const skipRAG = options.skipRAG ?? false;
  const skipDisciplinariPdf = options.skipDisciplinariPdf ?? false;
  const hasJobOperationsRag = !skipRAG && !!options.jobOperationsVectorStore?.hasDocuments?.();
  const hasDisciplinariPdf = !skipDisciplinariPdf && !!options.disciplinariPdfVectorStore;
  const hasTavily = !!(options.tavilyApiKey ?? process.env.TAVILY_API_KEY);
  return JSON.stringify({ hasJobOperationsRag, hasDisciplinariPdf, hasTavily });
}

function buildCacheConfig(options: CreateReactAgentOptions): AgentCacheConfig {
  const modelRouting = resolveModelRoutingFingerprint({
    preferredProvider: options.preferredProvider,
    modelName: options.modelName,
  });
  return {
    userId: options.userId,
    jobId: options.jobId,
    workspaceId: options.workspaceId,
    modelName: options.modelName ?? DEFAULT_REACT_MODEL,
    temperature: options.temperature,
    skipRAG: options.skipRAG ?? false,
    skipDisciplinariPdf: options.skipDisciplinariPdf ?? false,
    requireApproval: options.requireApproval ?? true,
    toolBundle: resolveToolBundle({
      jobId: options.jobId,
      forcedBundle: options.toolBundle,
    }),
    domain: options.domain,
    formMode: extractFormMode(options.clientContext),
    provider: modelRouting.provider,
    modelRoutingFingerprint: JSON.stringify(modelRouting),
    capabilityFingerprint: buildCapabilityFingerprint(options),
  };
}

function canReuseCachedAgent(entry: CachedAgentApp, options: CreateReactAgentOptions): boolean {
  const requested = buildCacheConfig(options);
  return canReuseCachedAgentConfig(entry.config, requested);
}

/**
 * Caches an AgentApp instance for a given threadId.
 */
export function cacheAgentApp(
  threadId: string,
  app: AgentApp,
  config: AgentCacheConfig,
  checkpointer?: import('@langchain/langgraph').BaseCheckpointSaver,
): void {
  ensureAgentCacheCleanup();
  agentAppCache.set(threadId, { app, checkpointer, config, lastAccessedAt: Date.now() });
}

/**
 * Removes a cached AgentApp for a given threadId.
 */
export function evictAgentApp(threadId: string): void {
  agentAppCache.delete(threadId);
  evictWorkingMemoryFromCache(threadId);
}

/**
 * Stops the agent cache cleanup timer. Useful for graceful shutdown and testing.
 */
export function stopAgentCacheCleanup(): void {
  if (agentCacheCleanupTimer) {
    clearInterval(agentCacheCleanupTimer);
    agentCacheCleanupTimer = null;
  }
}

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

/**
 * Adds a `proposalSummary` to a response that already carries `pendingToolCalls`,
 * inferring the target tool from the first pending call. No-op for other statuses.
 */
function withProposalSummary(threadId: string, response: AgentResponse): AgentResponse {
  if (response.status !== 'REQUIRES_APPROVAL') return response;
  const firstToolName = response.pendingToolCalls?.[0]?.name;
  if (!firstToolName) return response;
  const summary = buildProposalSummary(threadId, firstToolName);
  if (!summary) return response;
  return { ...response, proposalSummary: summary };
}

// ── Approval Handling ──

/**
 * Approves the pending destructive action and resumes execution.
 * Delegates to the shared HITL approve function with dosage-specific configuration:
 * risk policy for auto-continue and socket emitter for progress.
 */
export async function approveAction(app: AgentApp, threadId: string): Promise<AgentResponse> {
  const chatEmitter = createChatEmitter(threadId);
  const config = await buildAgentRunConfig(app, threadId, getApprovalDurability());
  const result = await hitlApprove({
    app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
    threadId,
    config,
    riskPolicy: dosageRiskPolicy,
    onAutoContinue: (iteration, msgs) => emitAutoContinueProgress(chatEmitter, iteration, msgs),
    formatPendingToolCalls: (toolCalls) =>
      buildPendingToolCallsForDisplay(
        threadId,
        toolCalls as Array<{ name: string; args: Record<string, unknown>; id: string }>,
      ),
  });
  // Enrich completed responses with source citations
  if (result.status === 'COMPLETED') {
    const stateConfig = { configurable: { thread_id: threadId } };
    await clearPendingActionState(app, stateConfig);
    const stateSnapshot = await app.getState(stateConfig);
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
    return { ...result, sources, pendingToolCalls: undefined };
  }
  return withProposalSummary(threadId, {
    ...result,
    pendingToolCalls: result.pendingToolCalls as AgentResponse['pendingToolCalls'],
  });
}

/**
 * Rejects the pending action and provides feedback to the agent.
 * Attempts a fork-based rejection (time-travel to pre-guard checkpoint) first.
 * Falls back to shared HITL reject (forward-cancel) if no suitable checkpoint is found.
 */
export async function rejectAction(
  app: AgentApp,
  threadId: string,
  reason: string,
): Promise<AgentResponse> {
  try {
    const config = await buildAgentRunConfig(app, threadId, getConversationDurability());
    const forkResult = await forkBeforeGuard({ app, threadId, rejectionReason: reason });
    if (forkResult) {
      console.log(
        `[rejectAction] Fork succeeded from checkpoint ${forkResult.sourceCheckpointId}. Resuming.`,
      );
      const forkConfig = {
        ...forkResult.forkConfig,
        configurable: {
          ...forkResult.forkConfig.configurable,
          thread_id: threadId,
        },
        recursionLimit: config.recursionLimit,
        durability: getConversationDurability(),
      };
      const stream = await app.stream(null, forkConfig);
      await consumeStream(stream);
      await clearPendingActionState(app, forkConfig);
      const stateSnapshot = await app.getState(forkConfig);
      const lastAIMessage = stateSnapshot.values.messages
        .slice()
        .reverse()
        .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;
      const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
      return {
        status: 'COMPLETED',
        message:
          lastAIMessage?.content?.toString() || "Azione rifiutata. L'agente è stato informato.",
        sources,
      };
    }
    // Fallback: shared HITL reject (forward-cancel approach)
    console.log(
      `[rejectAction] Fork failed for thread ${threadId}. Using forward-cancel fallback.`,
    );
    const result = await hitlReject({
      app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
      threadId,
      config,
      reason,
    });
    // Enrich with source citations
    if (result.status === 'COMPLETED') {
      await clearPendingActionState(app, config);
      const stateSnapshot = await app.getState(config);
      const sources = extractSourcesFromMessages(stateSnapshot.values.messages);
      return { ...result, sources, pendingToolCalls: undefined };
    }
    return withProposalSummary(threadId, {
      ...result,
      pendingToolCalls: result.pendingToolCalls as AgentResponse['pendingToolCalls'],
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto';
    return {
      status: 'ERROR',
      error: `Errore nel rifiuto: ${errorMessage}`,
    };
  }
}

// ── State Access ──

/**
 * Gets the current conversation state for a thread.
 */
export async function getAgentState(app: AgentApp, threadId: string): Promise<DosageReactState> {
  const config = { configurable: { thread_id: threadId } };
  const stateSnapshot = await app.getState(config);
  return stateSnapshot.values;
}

/**
 * Clears working memory, evicts the cached AgentApp, and resets the thread state.
 */
export function resetThread(threadId: string): void {
  clearWorkingMemory(threadId);
  agentAppCache.delete(threadId);
}

// ── Source Extraction ──

/**
 * Extracts source citations from tool messages.
 */
export function extractSourcesFromMessages(messages: BaseMessage[]): SourceCitation[] {
  const sources: SourceCitation[] = [];

  for (const message of messages) {
    if (message instanceof ToolMessage && message.name === 'tavily_scientific_search') {
      const content = message.content.toString();
      const sourceRegex =
        /\[SOURCE_(\d+)\]\s*Title:\s*(.+?)\s*URL:\s*(.+?)\s*Content:\s*(.+?)\s*Fragment:\s*(.+?)(?=\n---|\n\[SOURCE_|$)/gs;
      let match;

      while ((match = sourceRegex.exec(content)) !== null) {
        const [, , title, url, , fragment] = match;
        if (title && url && fragment) {
          sources.push({
            title: title.trim(),
            url: url.trim(),
            fragment: fragment.trim(),
          });
        }
      }
    }
  }

  return sources;
}
