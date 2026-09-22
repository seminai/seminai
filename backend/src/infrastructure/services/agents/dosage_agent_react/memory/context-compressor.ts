import { BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { AgentMemoryService } from './agent-memory.service';
import type { DosageReactState } from '../type/state';
import { createDurableTask } from '../graph/durable-execution';

const CHARS_PER_TOKEN = 4;

/**
 * Maximum characters preserved for a ToolMessage payload when it falls outside
 * the recent-turns window. 400 chars ≈ 100 tokens — keeps the gist (success
 * flag, key fields) while collapsing verbose tool outputs (product catalogs,
 * disciplinari extracts, RAG hits) that can easily run 5–10k chars each.
 *
 * PR-I bumped this from 200 → 400 alongside the `[ids: ...]` tag below: the
 * combination keeps the prompt under control while guaranteeing that entity
 * UUIDs created by tools (jobId, ruleId, productId, ...) survive the
 * compression even if they sit past the cutoff in the raw payload.
 */
const TOOL_SUMMARY_MAX_CHARS = 400;

/**
 * Pattern that matches a canonical UUID (v1–v5, case-insensitive). Used to
 * surface entity IDs that would otherwise be truncated out of the summary.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Returns the deduped, lowercased list of canonical UUIDs found in `str`. */
export function extractAllUuids(str: string): string[] {
  const matches = str.match(UUID_RE);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

/**
 * Default sliding window: keep the last N user turns at full fidelity.
 * A turn = one HumanMessage and everything between it and the next.
 */
export const DEFAULT_RECENT_TURNS_TO_KEEP = 6;

/**
 * Just-in-time history shrinker: keeps the last `recentTurnsToKeep` user turns
 * at full fidelity; for older turns, replaces verbose `ToolMessage` payloads
 * with a deterministic 1-line summary. `HumanMessage`/`AIMessage` text and the
 * AIMessage `tool_calls` (needed to keep the tool-call/result pairing valid)
 * are left untouched, so the conversational shape and the OpenAI prompt-cache
 * prefix remain stable across turns.
 *
 * Applied to the message array passed to the LLM, NOT to the graph state — the
 * full history is preserved in the checkpointer for audit and replay.
 */
export function summarizeOldToolResults(
  messages: BaseMessage[],
  recentTurnsToKeep: number = DEFAULT_RECENT_TURNS_TO_KEEP,
): BaseMessage[] {
  if (recentTurnsToKeep < 1 || messages.length === 0) {
    return messages;
  }
  const humanIndices: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i] instanceof HumanMessage) humanIndices.push(i);
  }
  if (humanIndices.length <= recentTurnsToKeep) {
    return messages;
  }
  const cutoffIdx = humanIndices[humanIndices.length - recentTurnsToKeep];
  let mutated = false;
  const next = messages.map((msg, idx) => {
    if (idx >= cutoffIdx) return msg;
    if (!(msg instanceof ToolMessage)) return msg;
    const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    if (contentStr.length <= TOOL_SUMMARY_MAX_CHARS) return msg;
    mutated = true;
    const name = msg.name ?? 'unknown_tool';
    const snippet = contentStr.slice(0, TOOL_SUMMARY_MAX_CHARS);
    const truncated = contentStr.length - TOOL_SUMMARY_MAX_CHARS;
    // Pre-extract UUIDs from the FULL payload so entity references survive
    // the truncation even when they sit past the cutoff (PR-I, F8).
    const ids = extractAllUuids(contentStr);
    const idsTag = ids.length > 0 ? ` [ids: ${ids.join(', ')}]` : '';
    return new ToolMessage({
      id: msg.id,
      content: `[summary] ${name} → ${snippet}… (+${truncated} chars truncated)${idsTag}`,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    });
  });
  return mutated ? next : messages;
}

/**
 * Options for context compression persistence.
 */
export interface CompressOptions {
  readonly userId?: string;
  readonly threadId?: string;
}

/**
 * Context window compressor for LangGraph ReAct agents.
 * Reduces token count by summarizing middle messages and persisting to episodic memory.
 */
export class ContextCompressor {
  private readonly modelContextLimit: number;
  private readonly compressionThreshold: number;
  private readonly keepRecentCount: number;
  private readonly memoryService: AgentMemoryService;
  private readonly saveCompressedSummaryTask = createDurableTask(
    'dosage_react_save_compressed_context',
    async (input: { userId: string; threadId: string; summary: string; compressedCount: number }) =>
      this.memoryService.saveEpisodicMemory(input.userId, `dosage_compress_${input.threadId}`, {
        summary: input.summary,
        compressedCount: input.compressedCount,
      }),
  );

  /**
   * @param modelContextLimit - Maximum tokens the model can handle (default 128000)
   * @param compressionThreshold - Compress when usage exceeds this fraction (default 0.7)
   * @param keepRecentCount - Number of recent messages to always retain (default 5)
   */
  constructor(
    modelContextLimit = 128_000,
    compressionThreshold = 0.7,
    keepRecentCount = 5,
    memoryService = new AgentMemoryService(),
  ) {
    this.modelContextLimit = modelContextLimit;
    this.compressionThreshold = compressionThreshold;
    this.keepRecentCount = keepRecentCount;
    this.memoryService = memoryService;
  }

  /**
   * Estimates total tokens from message content using 1 token ≈ 4 characters heuristic.
   */
  countTokens(messages: BaseMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => {
      const content = msg.content;
      const str = typeof content === 'string' ? content : JSON.stringify(content);
      return sum + str.length;
    }, 0);
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  }

  /**
   * Returns true if token count exceeds the compression threshold.
   */
  shouldCompress(messages: BaseMessage[]): boolean {
    const tokens = this.countTokens(messages);
    const limit = this.modelContextLimit * this.compressionThreshold;
    return tokens > limit;
  }

  /**
   * Compresses messages by keeping first system message, last N messages,
   * and replacing the middle with a summary. Optionally persists to episodic memory.
   */
  async compress(messages: BaseMessage[], options?: CompressOptions): Promise<BaseMessage[]> {
    if (messages.length <= this.keepRecentCount + 1) {
      return messages;
    }
    const firstMessage = messages[0];
    const isFirstSystem = firstMessage instanceof SystemMessage;
    const firstPart: BaseMessage[] = isFirstSystem ? [firstMessage] : [];
    const lastPart = messages.slice(-this.keepRecentCount);
    const middleStart = firstPart.length;
    const middleEnd = messages.length - this.keepRecentCount;
    const middlePart = messages.slice(middleStart, middleEnd);
    if (middlePart.length === 0) {
      return [...firstPart, ...lastPart];
    }
    const summary = this.buildSummary(middlePart);
    const summaryMessage = new SystemMessage(`[Compressed context summary]\n${summary}`);
    const compressed: BaseMessage[] = [...firstPart, summaryMessage, ...lastPart];
    if (options?.userId && options?.threadId) {
      await this.saveCompressedSummaryTask({
        userId: options.userId,
        threadId: options.threadId,
        summary,
        compressedCount: middlePart.length,
      });
    }
    return compressed;
  }

  private buildSummary(middle: BaseMessage[]): string {
    const toolLines: string[] = [];
    const importantFacts: string[] = [];
    for (const msg of middle) {
      if (msg instanceof ToolMessage) {
        const name = msg.name ?? 'unknown_tool';
        const contentStr =
          typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        const snippet = contentStr.slice(0, 200);
        toolLines.push(`- Tool: ${name} | Result: ${snippet}`);
        // Extract compliance outcomes
        this.extractComplianceFacts(name, contentStr, importantFacts);
        // Extract created entity IDs
        this.extractCreatedEntities(contentStr, importantFacts);
      }
      // Extract user decisions from HumanMessages
      if (msg instanceof HumanMessage) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (/approv|conferm|accett|ok.*procedi|sì.*procedi|sì.*esegu/i.test(content)) {
          importantFacts.push(`- Decisione utente: approvazione ("${content.slice(0, 100)}")`);
        }
        if (/rifiut|no.*non|annull|cambi/i.test(content)) {
          importantFacts.push(`- Decisione utente: rifiuto/modifica ("${content.slice(0, 100)}")`);
        }
      }
    }
    const sections: string[] = [];
    if (importantFacts.length > 0) {
      sections.push('## Important Facts\n' + importantFacts.join('\n'));
    }
    if (toolLines.length > 0) {
      sections.push('## Tool Calls\n' + toolLines.join('\n'));
    }
    if (sections.length === 0) {
      return `Previous ${middle.length} messages compressed (no tool calls).`;
    }
    return sections.join('\n\n');
  }

  /**
   * Extracts compliance outcomes from tool results.
   */
  private extractComplianceFacts(toolName: string, content: string, facts: string[]): void {
    if (toolName !== 'validate_compliance' && toolName !== 'run_conformity_check') return;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const violations = parsed.violations as unknown[] | undefined;
      if (violations && violations.length > 0) {
        facts.push(`- Conformità: ${violations.length} violazione/i trovata/e (${toolName})`);
      } else if (violations && violations.length === 0) {
        facts.push(`- Conformità: nessuna violazione (${toolName})`);
      }
    } catch {
      /* non-JSON */
    }
  }

  /**
   * Extracts created entity IDs from tool results.
   */
  private extractCreatedEntities(content: string, facts: string[]): void {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed.companyId) facts.push(`- Azienda creata: ${parsed.companyId}`);
      if (parsed.fieldIds) facts.push(`- Campi creati: ${(parsed.fieldIds as string[]).length}`);
      if (parsed.productionUnitIds)
        facts.push(`- UP create: ${(parsed.productionUnitIds as string[]).length}`);
      if (parsed.jobId) facts.push(`- Job creato: ${parsed.jobId}`);
      if (parsed.treatmentJobId) facts.push(`- Job trattamento creato: ${parsed.treatmentJobId}`);
      if (parsed.ruleId) facts.push(`- Regola creata: ${parsed.ruleId}`);
      if (parsed.workspaceRuleId)
        facts.push(`- Regola workspace creata: ${parsed.workspaceRuleId}`);
      if (parsed.productId) facts.push(`- Prodotto creato: ${parsed.productId}`);
      if (parsed.fieldNoteId) facts.push(`- Nota di campo creata: ${parsed.fieldNoteId}`);
      if (parsed.stockMovementId)
        facts.push(`- Movimento magazzino creato: ${parsed.stockMovementId}`);
    } catch {
      /* non-JSON */
    }
  }
}

/**
 * Creates a graph node that compresses the message history when token count
 * exceeds the threshold. Matches LangGraph node signature.
 *
 * @param threadId - Thread identifier for episodic memory key
 * @param userId - Optional user ID for memory persistence
 * @returns Async function (state) => Partial<DosageReactState>
 */
export function createContextCompressorNode(
  threadId: string,
  userId?: string,
): (state: DosageReactState) => Promise<Partial<DosageReactState>> {
  const compressor = new ContextCompressor();

  return async (state: DosageReactState): Promise<Partial<DosageReactState>> => {
    const { messages } = state;
    if (messages.length === 0 || !compressor.shouldCompress(messages)) {
      return {};
    }
    const compressed = await compressor.compress(messages, {
      userId,
      threadId,
    });
    return { messages: compressed };
  };
}
