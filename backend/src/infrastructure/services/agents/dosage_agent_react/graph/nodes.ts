import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import { DosageReactState } from '../type/state';
import { classifyRisk, shouldAutoApprove } from './risk-classifier';
import { LoopDetector } from '../loop-detector';
import { LlmUsageLogger } from '../../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, TokenUsage, UsageAccumulator } from '../../../llm_costs/usage';
import { LlmJobType } from '@prisma/client';
import { getWorkingMemory } from '../working-memory';
import { createDurableTask } from './durable-execution';
import { summarizeOldToolResults } from '../memory/context-compressor';
import { createToolCallRecord, normalizeToolCallHistory } from './tool-call-record';
import { computeReactRuntimeBudget } from './react-runtime-budget';
import type { ToolBundle } from './tool-registry';
import { buildGenericLoopStopMessage, buildLoopFallbackMessage } from './loop-fallback-message';
import {
  resolveAgentModels,
  selectAgentModel,
  toSelectedModelState,
  type AgentModelSelectorOptions,
} from './agent-model-selector';
import { buildPhotoDiagnosisFinalReplyHint } from './photo-diagnosis-hint';

const usageLogger = LlmUsageLogger.getInstance();

export interface AgentNodeOptions {
  modelWithTools?: ChatOpenAI;
  models?: AgentModelSelectorOptions['models'];
  systemPromptText: string;
  modelName?: string;
  threadId: string;
  userId?: string;
  jobId?: string;
}

export interface GuardNodeOptions {
  readonly toolBundle?: ToolBundle;
  readonly toolNames?: ReadonlyArray<string>;
  readonly threadId?: string;
}

interface UsageLogInput {
  readonly tokens: TokenUsage;
  readonly modelName: string;
}

/**
 * Agent reasoning node.
 * Processes messages, decides which tool to call or responds directly.
 */
export function createAgentNode(options: AgentNodeOptions) {
  const { systemPromptText, threadId, userId, jobId } = options;
  const models = resolveAgentModels(options);

  // Usage logging stays in a durable task (idempotent, safe to replay).
  const persistUsageTask = createDurableTask<UsageLogInput, boolean>(
    'dosage_react_agent_usage_log',
    async ({ tokens, modelName }) => {
      if (!userId) {
        return false;
      }
      await usageLogger.logFromUsage(tokens, {
        userId,
        jobId,
        jobGroupId: threadId,
        jobType: LlmJobType.DOSAGE,
        model: modelName,
        metadata: { step: 'dosage-react-agent' },
      });
      return true;
    },
  );

  return async (state: DosageReactState): Promise<Partial<DosageReactState>> => {
    const { messages } = state;
    const memoryContext = getWorkingMemory(threadId).memoryContext;
    // Scan all ToolMessages since the last HumanMessage to build the set of tools that
    // already ran successfully in this turn.  We look past the last message so the rule
    // fires even when the very last ToolMessage belongs to a different (low-risk) tool.
    const lastHumanIdx = messages.reduceRight(
      (acc: number, msg, idx) => (acc === -1 && msg instanceof HumanMessage ? idx : acc),
      -1,
    );
    const recentMessages =
      lastHumanIdx >= 0 ? messages.slice(lastHumanIdx + 1) : messages.slice(-20);
    const successfulToolsThisTurn = [
      ...new Set(
        recentMessages
          .filter((m): m is ToolMessage => m instanceof ToolMessage)
          .filter((m) => {
            try {
              const parsed = JSON.parse(String(m.content)) as Record<string, unknown>;
              // Exclude cancelled calls (injected by cancelPendingToolCalls) and error results.
              return !parsed.error && !parsed.cancelled;
            } catch {
              return true; // non-JSON response → assume success
            }
          })
          .map((m) => m.name)
          .filter((name): name is string => !!name),
      ),
    ];
    const selectedModel = selectAgentModel(state, successfulToolsThisTurn, models);
    // Base system message is byte-identical across turns so the OpenAI prompt-cache
    // prefix (system + tool schemas) stays stable. Per-turn dynamic context
    // (post-execution rule, working memory) is appended as a separate trailing
    // SystemMessage AFTER the conversation history — it doesn't invalidate the
    // cacheable prefix.
    const baseSystemMessage = new SystemMessage(systemPromptText);
    const baseMessages = [baseSystemMessage, ...messages];

    const dynamicHints: string[] = [];
    if (successfulToolsThisTurn.length > 0) {
      dynamicHints.push(
        `## Post-Execution Rule\nThe following tools already ran SUCCESSFULLY this turn: [${successfulToolsThisTurn.join(', ')}].\nDo NOT call the same tool again with the same parameters. If the user workflow still requires a later DIFFERENT tool, continue with the next required tool instead of stopping. For dosage planning: after search_products call calculate_dosage; after calculate_dosage call generate_treatment_plan; after generate_treatment_plan present the markdown table and stop for user approval.`,
      );
    }
    const photoDiagnosisHint = buildPhotoDiagnosisFinalReplyHint(successfulToolsThisTurn);
    if (photoDiagnosisHint) {
      dynamicHints.push(photoDiagnosisHint);
    }
    const wm = getWorkingMemory(threadId);
    if (wm.inputProducts?.length && wm.inputUnits?.length && !wm.matchedProducts?.length) {
      dynamicHints.push(
        '## Dosage Draft Shortcut\ninputProducts and inputUnits are already loaded in working memory. For an explicit quick draft, call calculate_dosage directly; it can auto-match products before calculating dosage. Use search_products only for targeted product-crop verification or when a complete label extraction is explicitly needed.',
      );
    }
    if (memoryContext) {
      dynamicHints.push(`## Persisted Memory Context\n${memoryContext}`);
    }

    // Sliding window: shrink old ToolMessage payloads before invoking the LLM.
    // Graph state keeps the full history (checkpointer/audit); only the LLM
    // payload is trimmed. Deterministic summaries keep the prompt-cache prefix
    // stable from the first turn the older messages enter the compressed range.
    const trimmedBaseMessages = summarizeOldToolResults(baseMessages);

    const messagesWithSystem =
      dynamicHints.length > 0
        ? [...trimmedBaseMessages, new SystemMessage(dynamicHints.join('\n\n'))]
        : trimmedBaseMessages;

    // LLM call OUTSIDE task() — allows LangGraph streamMode: "messages" to
    // intercept token-by-token callbacks from the underlying ChatOpenAI model.
    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const response = await selectedModel.modelWithTools.invoke(messagesWithSystem, {
      callbacks: [usageCollector],
    });

    // Persist usage in a durable task (replay-safe).
    await persistUsageTask({
      tokens: usageAccumulator.getTotals(),
      modelName: selectedModel.modelName,
    });

    const aiMessage = response as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    };
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolCall = aiMessage.tool_calls[0];
      const riskClassification = classifyRisk(toolCall.name, toolCall.args);
      return {
        messages: [response],
        pendingAction: {
          tool: toolCall.name,
          args: toolCall.args,
          description: `Esecuzione ${toolCall.name}`,
          requiresApproval: !shouldAutoApprove(riskClassification),
          riskLevel: riskClassification.level,
          riskReason: riskClassification.reason,
        },
        selectedModel: toSelectedModelState(selectedModel),
      };
    }

    // No further tool calls: this turn produced a final reply. Emit the
    // explicit clear sentinel so the reducer drops any stale pendingAction
    // left over from a previous turn (see graph-state.ts).
    return {
      messages: [response],
      pendingAction: null,
      selectedModel: toSelectedModelState(selectedModel),
    } as unknown as Partial<DosageReactState>;
  };
}

/**
 * Guard node.
 * Checks loop detection, approval gates, and working memory prerequisites.
 * Returns updated state (may inject warning messages).
 */
export function createGuardNode(loopDetector: LoopDetector, options: GuardNodeOptions = {}) {
  return async (state: DosageReactState): Promise<Partial<DosageReactState>> => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    };

    const toolName = lastMessage?.tool_calls?.[0]?.name ?? 'unknown';
    const toolRecord = createToolCallRecord(lastMessage?.tool_calls?.[0]);
    const previousRecords =
      state.lastToolCallRecords && state.lastToolCallRecords.length > 0
        ? state.lastToolCallRecords
        : normalizeToolCallHistory(state.lastToolCalls);
    const updatedToolCallRecords = [...previousRecords, toolRecord];
    const runtimeBudget = computeReactRuntimeBudget({
      toolBundle: options.toolBundle,
      taskList: state.taskList,
      toolNames: options.toolNames,
    });

    // Update loop tracking
    const updatedToolCalls = [...state.lastToolCalls, toolName];
    const newLoopCounter = state.loopCounter + 1;

    // Check loop status and inject warning if needed
    const loopStatus = loopDetector.detect(updatedToolCallRecords, runtimeBudget);
    if (loopStatus === 'warning') {
      console.warn(
        `[DOSAGE-REACT] Loop warning: ${newLoopCounter} tool calls. Recent: ${updatedToolCalls.slice(-5).join(' → ')}`,
      );
    }
    if (loopStatus === 'critical' || loopStatus === 'pattern') {
      const recent = updatedToolCalls.slice(-5).join(' → ');
      console.warn(
        `[DOSAGE-REACT] Loop hard-stop (${loopStatus}): ${newLoopCounter} tool calls. Recent: ${recent}`,
      );

      const cancellationMessages = (lastMessage.tool_calls ?? []).flatMap((tc) => {
        if (!tc.id) return [];
        return [
          new ToolMessage({
            content: JSON.stringify({
              cancelled: true,
              loopDetected: true,
              reason: `Interrotto per evitare un ciclo tecnico (${loopStatus}).`,
            }),
            tool_call_id: tc.id,
            name: tc.name,
          }),
        ];
      });

      const repeatedTool = findRepeatedToolName(updatedToolCalls) ?? toolName;
      const fallbackMessage = buildLoopFallbackMessage({
        threadId: options.threadId,
        repeatedTool,
        messages: state.messages,
      });
      return {
        loopCounter: newLoopCounter,
        lastToolCalls: updatedToolCalls,
        lastToolCallRecords: updatedToolCallRecords,
        messages: [
          ...cancellationMessages,
          new AIMessage({
            content: fallbackMessage ?? buildGenericLoopStopMessage(repeatedTool, loopStatus),
          }),
        ],
        pendingAction: null,
      } as unknown as Partial<DosageReactState>;
    }

    return {
      loopCounter: newLoopCounter,
      lastToolCalls: updatedToolCalls,
      lastToolCallRecords: updatedToolCallRecords,
    };
  };
}

function findRepeatedToolName(toolCalls: readonly string[]): string | undefined {
  if (toolCalls.length === 0) return undefined;
  const recent = toolCalls.slice(-5);
  if (recent.length > 0 && recent.every((name) => name === recent[0])) {
    return recent[0];
  }
  return toolCalls[toolCalls.length - 1];
}

/**
 * Approval gate node.
 * Empty node — graph pauses here via interruptBefore when a destructive tool is requested.
 */
export function createApprovalGateNode() {
  return async (_state: DosageReactState): Promise<Partial<DosageReactState>> => {
    // This node is a passthrough. The graph will interrupt BEFORE entering it
    // when requireApproval=true. After approval, it passes through to the tools node.
    return {};
  };
}
