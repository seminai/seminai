import { type RiskLevel } from './graph/risk-classifier';
import { type ProposalSummary } from './proposal-summary';
import { SourceCitation } from '../chat_dosage_agent/types';
import type { Questionnaire } from './type/questionnaire';
import { Runnable, type RunnableConfig } from '@langchain/core/runnables';
import type { StreamMode, StateSnapshot } from '@langchain/langgraph';
import { DosageReactState } from './type/state';
import type { CheckpointListOptions } from '@langchain/langgraph-checkpoint';
import { AgentCacheConfig, canReuseCachedAgentConfig } from './agent-cache-config';
import { resolveToolBundle, type ToolBundle } from './graph/tool-registry';
import { computeReactRuntimeBudget } from './graph/react-runtime-budget';
import { evictWorkingMemoryFromCache } from './working-memory';
import { resolveModelRoutingFingerprint } from '../shared/modelRouter';
import { DEFAULT_REACT_MODEL } from './graph/DosageReactGraph';
import { CreateReactAgentOptions } from './DosageReactAgent.part-02-create-react-agent-options';

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
export async function clearPendingActionState(
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

export async function consumeStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const event of stream) {
    void event;
  }
}

// ── AgentApp Instance Cache ──

export interface CachedAgentApp {
  app: AgentApp;
  checkpointer?: import('@langchain/langgraph').BaseCheckpointSaver;
  lastAccessedAt: number;
  config: AgentCacheConfig;
}

export const AGENT_CACHE_TTL_MS = 30 * 60 * 1000;

// 30 minutes
export const AGENT_CACHE_MAX_ENTRIES = 200;

export const agentAppCache = new Map<string, CachedAgentApp>();

export let agentCacheCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function isToolBundle(value: string | undefined): value is ToolBundle {
  return value === 'DOSAGE' || value === 'FULL' || value === 'MANUFACTURING';
}

export async function buildAgentRunConfig(
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

export function evictStaleAgentApps(): void {
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

export function ensureAgentCacheCleanup(): void {
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

export function extractFormMode(clientContext?: Record<string, unknown>): string | undefined {
  const value = clientContext?.formMode;
  return typeof value === 'string' ? value : undefined;
}

export function buildCapabilityFingerprint(options: CreateReactAgentOptions): string {
  const skipRAG = options.skipRAG ?? false;
  const skipDisciplinariPdf = options.skipDisciplinariPdf ?? false;
  const hasJobOperationsRag = !skipRAG && !!options.jobOperationsVectorStore?.hasDocuments?.();
  const hasDisciplinariPdf = !skipDisciplinariPdf && !!options.disciplinariPdfVectorStore;
  const hasTavily = !!(options.tavilyApiKey ?? process.env.TAVILY_API_KEY);
  return JSON.stringify({ hasJobOperationsRag, hasDisciplinariPdf, hasTavily });
}

export function buildCacheConfig(options: CreateReactAgentOptions): AgentCacheConfig {
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

export function canReuseCachedAgent(entry: CachedAgentApp, options: CreateReactAgentOptions): boolean {
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
