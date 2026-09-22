import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { AgentState, PendingFieldNoteAction } from './types';
import { BaseMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { PrismaClient } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { FIELD_NOTE_SYSTEM_PROMPT } from './prompts/fieldNoteSystemPrompt';
import { LOG_PREFIX } from './messages';
import { type ChatModelName } from '../../llm-model-validation';
import { detectFieldNoteToolLoop, type FieldNoteLoopStatus } from './runtime';


/**
 * Tool names that require human approval before execution.
 * These are "destructive" operations that modify the database.
 */
export const TOOLS_REQUIRING_APPROVAL = [
  'save_field_note',
  'save_stock_in_purchase',
  'save_stock_in_harvest',
  'save_stock_out_sale',
  'save_stock_out_treatment',
];


/**
 * Always prepends the base FIELD_NOTE_SYSTEM_PROMPT to the LLM payload,
 * mirroring the parent dosage_agent_react fix (graph/nodes.ts:84-85).
 *
 * The previous conditional `messages[0] instanceof SystemMessage ? skip : prepend`
 * silently dropped the base prompt whenever the first message was a
 * SystemMessage of a different kind — for example after Prisma restore
 * (FieldNoteAgentRegistry.convertPrismaMessagesToLangChain) or once a future
 * compressor inserts a summary SystemMessage — letting the model lose domain
 * constraints like "CAMPO OBBLIGATORIO" / "AZIENDA OBBLIGATORIA".
 *
 * The graph state is NOT contaminated by the prepend: the agent node still
 * returns only the produced AIMessage in its `messages` update.
 */
export function prependFieldNoteSystemPrompt(messages: BaseMessage[]): BaseMessage[] {
  return [new SystemMessage(FIELD_NOTE_SYSTEM_PROMPT), ...messages];
}


/**
 * Reducer for the `pendingAction` channel. `null` is the explicit clear
 * sentinel emitted by nodes that finish a turn without an approval-gated tool
 * call; `undefined` means "no change" so unrelated state updates do not wipe
 * the pending action. Mirrors the dosage_agent_react reducer (channels-based
 * equivalent of `DosageReactAnnotation.pendingAction`).
 */
export function pendingActionReducer(
  current: PendingFieldNoteAction | undefined,
  update: PendingFieldNoteAction | null | undefined,
): PendingFieldNoteAction | undefined {
  if (update === null) return undefined;
  return update === undefined ? current : update;
}


export type ChatModel = ChatModelName;


/**
 * Factory class for creating the LangGraph agent workflow.
 * Implements human-in-the-loop pattern with interrupt before tool execution.
 */
export const usageLogger = LlmUsageLogger.getInstance();


/**
 * Configuration options for creating a FieldNoteAgentGraphFactory.
 */
export interface FieldNoteAgentGraphFactoryOptions {
  modelName?: ChatModel;
  temperature?: number;
  openAIApiKey?: string;
  userId: string;
  prisma: PrismaClient;
  /** Optional checkpointer for state persistence. Defaults to a new MemorySaver instance. */
  checkpointer?: BaseCheckpointSaver;
  /** Thread ID for per-thread BDF product vector store caching. */
  threadId?: string;
}


export function createFieldNoteGuardNode() {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
    };

    const toolName = lastMessage?.tool_calls?.[0]?.name;
    if (!toolName) {
      return {};
    }

    const updatedToolCalls = [...(state.lastToolCalls ?? []), toolName];
    const toolCallCount = (state.toolCallCount ?? 0) + 1;
    const loopStatus = detectFieldNoteToolLoop(updatedToolCalls);

    if (loopStatus === 'warning') {
      console.warn(
        `${LOG_PREFIX.GRAPH} Loop warning: ${toolCallCount} tool calls. Recent: ${updatedToolCalls.slice(-5).join(' → ')}`,
      );
    }

    if (loopStatus === 'critical' || loopStatus === 'pattern') {
      const recent = updatedToolCalls.slice(-5).join(' → ');
      console.warn(
        `${LOG_PREFIX.GRAPH} Loop hard-stop (${loopStatus}): ${toolCallCount} tool calls. Recent: ${recent}`,
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

      return {
        toolCallCount,
        lastToolCalls: updatedToolCalls,
        messages: [
          ...cancellationMessages,
          new AIMessage({
            content: buildFieldNoteLoopStopMessage(toolName, loopStatus),
          }),
        ],
        pendingAction: null,
      } as unknown as Partial<AgentState>;
    }

    return {
      toolCallCount,
      lastToolCalls: updatedToolCalls,
    };
  };
}


export function buildFieldNoteLoopStopMessage(
  toolName: string,
  loopStatus: Extract<FieldNoteLoopStatus, 'critical' | 'pattern'>,
): string {
  const reason =
    loopStatus === 'pattern'
      ? `stava ripetendo ${toolName} senza aggiungere nuove informazioni`
      : 'ha raggiunto il limite di sicurezza delle chiamate tool';

  return [
    `Mi sono fermato per evitare un ciclo tecnico nel sotto-agente note di campo: il flusso ${reason}.`,
    'I dati già raccolti restano disponibili nella conversazione.',
    'Per procedere in modo stabile, riformula la richiesta o restringi il contesto a campo, coltura, prodotto o periodo.',
  ].join('\n');
}
