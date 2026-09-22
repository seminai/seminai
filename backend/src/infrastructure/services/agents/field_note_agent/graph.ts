import { StateGraph, END, START, MemorySaver, BaseCheckpointSaver } from '@langchain/langgraph';
import type { ChatOpenAI } from '@langchain/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { AgentState, PendingFieldNoteAction } from './types';
import {
  createClassifyFieldNoteDataTool,
  createFindUserCompaniesTool,
  createFindUserFieldsTool,
  createFindUserProductionUnitsTool,
  createFindUserProductsTool,
  createSaveFieldNoteTool,
  createSaveStockInPurchaseTool,
  createSaveStockInHarvestTool,
  createSaveStockOutSaleTool,
  createSaveStockOutTreatmentTool,
  createExtractGpsFromImageTool,
  createCountUserFieldNotesTool,
  createListUserFieldNotesTool,
  createGetUserFieldNoteByIdTool,
} from './tools';
import { BaseMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { PrismaClient, LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createCachedBdfClient, createBdfSearchProductDosesTool } from '../../integrations/bdf';
import {
  createBdfSearchProductsByAdversityWithCacheTool,
  createSearchBdfCachedProductsTool,
} from './bdfToolWrappers';
import { FIELD_NOTE_SYSTEM_PROMPT } from './prompts/fieldNoteSystemPrompt';
import { LOG_PREFIX } from './messages';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { createChatModel } from '../../llm-model-factory';
import {
  VALID_CHAT_MODELS,
  type ChatModelName,
  isValidChatModelName,
} from '../../llm-model-validation';
import { detectFieldNoteToolLoop, type FieldNoteLoopStatus } from './runtime';

/**
 * Tool names that require human approval before execution.
 * These are "destructive" operations that modify the database.
 */
const TOOLS_REQUIRING_APPROVAL = [
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
const usageLogger = LlmUsageLogger.getInstance();

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

export class FieldNoteAgentGraphFactory {
  private readonly model: ChatOpenAI;
  private readonly userId: string;
  private readonly prisma: PrismaClient;
  private readonly openAIApiKey?: string;
  private readonly modelName: string;
  private readonly checkpointer: BaseCheckpointSaver;
  private readonly threadId: string;

  /**
   * Creates a new FieldNoteAgentGraphFactory instance.
   * @param options Configuration options for the agent
   */
  constructor(options: FieldNoteAgentGraphFactoryOptions) {
    const modelName = options.modelName || 'gpt-4o';
    const openAIApiKey = options.openAIApiKey || process.env.OPENAI_API_KEY;

    if (!isValidChatModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Must be one of: ${VALID_CHAT_MODELS.join(', ')}`,
      );
    }

    const created = createChatModel({
      modelName,
      temperature: options.temperature ?? 0.1,
    });
    this.model = created.model;

    this.userId = options.userId;
    this.prisma = options.prisma;
    this.openAIApiKey = openAIApiKey;
    this.modelName = created.modelName;
    this.checkpointer = options.checkpointer ?? new MemorySaver();
    this.threadId = options.threadId ?? 'default';
  }

  /**
   * Creates and compiles the LangGraph workflow with human-in-the-loop support.
   * The graph will interrupt before save/stock tools to allow human approval.
   * Analysis tools (classify, find_*) run automatically without approval.
   */
  public createGraph(): FieldNoteAgentApp {
    // 1. Define Tools - separated into analysis and save categories
    const classifyTool = createClassifyFieldNoteDataTool(this.openAIApiKey);
    const findCompaniesTool = createFindUserCompaniesTool(this.userId, this.prisma);
    const findFieldsTool = createFindUserFieldsTool(this.userId, this.prisma);
    const findProductionUnitsTool = createFindUserProductionUnitsTool(this.userId, this.prisma);
    const findProductsTool = createFindUserProductsTool(this.userId, this.prisma);
    const saveFieldNoteTool = createSaveFieldNoteTool(this.userId, this.prisma);
    const saveStockInPurchaseTool = createSaveStockInPurchaseTool(this.userId, this.prisma);
    const saveStockInHarvestTool = createSaveStockInHarvestTool(this.userId, this.prisma);
    const saveStockOutSaleTool = createSaveStockOutSaleTool(this.userId, this.prisma);
    const saveStockOutTreatmentTool = createSaveStockOutTreatmentTool(this.userId, this.prisma);
    const extractGpsTool = createExtractGpsFromImageTool();
    const countFieldNotesTool = createCountUserFieldNotesTool(this.userId, this.prisma);
    const listFieldNotesTool = createListUserFieldNotesTool(this.userId, this.prisma);
    const getFieldNoteByIdTool = createGetUserFieldNoteByIdTool(this.userId, this.prisma);

    // BDF official database tools (if credentials available)
    // Uses caching wrappers that index large result sets in an in-memory vector store
    const bdfToolsList: StructuredTool[] = [];
    const bdfBaseUrl = process.env.URL_SERVER_BDF;
    const bdfUsername = process.env.USERNAME_BDF;
    const bdfPassword = process.env.PASSWORD_BDF;
    if (bdfBaseUrl && bdfUsername && bdfPassword) {
      const bdfClient = createCachedBdfClient();
      bdfToolsList.push(
        createBdfSearchProductDosesTool(bdfClient),
        createBdfSearchProductsByAdversityWithCacheTool(bdfClient, this.threadId),
        createSearchBdfCachedProductsTool(this.threadId),
      );
    }

    // All tools for the model to know about
    const allTools: StructuredTool[] = [
      classifyTool,
      findCompaniesTool,
      findFieldsTool,
      findProductionUnitsTool,
      findProductsTool,
      extractGpsTool,
      countFieldNotesTool,
      listFieldNotesTool,
      getFieldNoteByIdTool,
      ...bdfToolsList,
      saveFieldNoteTool,
      saveStockInPurchaseTool,
      saveStockInHarvestTool,
      saveStockOutSaleTool,
      saveStockOutTreatmentTool,
    ];

    // Tools that run automatically (no approval needed)
    const analysisTools: StructuredTool[] = [
      classifyTool,
      findCompaniesTool,
      findFieldsTool,
      findProductionUnitsTool,
      findProductsTool,
      extractGpsTool,
      countFieldNotesTool,
      listFieldNotesTool,
      getFieldNoteByIdTool,
      ...bdfToolsList,
    ];

    // Tools that require human approval
    const saveTools: StructuredTool[] = [
      saveFieldNoteTool,
      saveStockInPurchaseTool,
      saveStockInHarvestTool,
      saveStockOutSaleTool,
      saveStockOutTreatmentTool,
    ];

    const modelWithTools = this.model.bindTools(allTools);

    // 2. Define Nodes

    /**
     * Agent reasoning node.
     * Processes user messages and decides whether to use tools or respond directly.
     */
    const agentNode = async (state: AgentState): Promise<Partial<AgentState>> => {
      const { messages } = state;

      // Always prepend the base FIELD_NOTE_SYSTEM_PROMPT, even if the history
      // already starts with a SystemMessage (e.g. after Prisma restore). See
      // prependFieldNoteSystemPrompt above for the rationale.
      const messagesWithSystem = prependFieldNoteSystemPrompt(messages);

      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const response = await modelWithTools.invoke(messagesWithSystem, {
        callbacks: [usageCollector],
      });

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(usageAccumulator, {
          userId: this.userId,
          jobType: LlmJobType.FIELD_NOTE,
          model: this.modelName,
          metadata: { step: 'field-note-agent' },
        })
        .catch((err) => console.warn(`${LOG_PREFIX.HANDLER} Failed to log usage:`, err));

      const responseAi = response as AIMessage & {
        tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
      };
      const firstApprovalCall = responseAi.tool_calls?.find((tc) =>
        TOOLS_REQUIRING_APPROVAL.includes(tc.name),
      );

      if (firstApprovalCall) {
        return {
          messages: [response],
          pendingAction: {
            tool: firstApprovalCall.name,
            args: firstApprovalCall.args,
            description: `Esecuzione ${firstApprovalCall.name}`,
            requiresApproval: true,
            riskLevel: 'medium',
          },
        };
      }

      // No further approval-gated tool calls: drop any stale pendingAction.
      return {
        messages: [response],
        pendingAction: null,
      } as unknown as Partial<AgentState>;
    };

    const guardNode = createFieldNoteGuardNode();

    /**
     * Analysis tools execution node.
     * Executes classify, find_* tools automatically without approval.
     */
    const analysisToolsNode = new ToolNode(analysisTools);

    /**
     * Save tools execution node.
     * Executes save_field_note tool (requires human approval via interrupt).
     */
    const saveToolsNode = new ToolNode(saveTools);

    /**
     * Router function that determines the next step based on which tool is being called.
     * Routes to different tool nodes based on whether approval is needed.
     * @param state Current agent state
     * @returns Next node to execute or END
     */
    const shouldContinue = (state: AgentState): string => {
      const { messages } = state;
      const lastMessage = messages[messages.length - 1] as AIMessage;

      if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        const hasApprovalRequired = lastMessage.tool_calls.some((tc) =>
          TOOLS_REQUIRING_APPROVAL.includes(tc.name),
        );

        if (hasApprovalRequired) {
          const toolNames = [...new Set(lastMessage.tool_calls.map((tc) => tc.name))];
          console.log(
            `${LOG_PREFIX.GRAPH} Tools [${toolNames.join(', ')}] require approval, routing to save_tools`,
          );
          return 'save_tools';
        }

        const toolName = lastMessage.tool_calls[0].name;
        console.log(`${LOG_PREFIX.GRAPH} Tool ${toolName} is automatic, routing to analysis_tools`);
        return 'analysis_tools';
      }

      return END;
    };

    // 3. Build the Graph
    const workflow = new StateGraph<AgentState>({
      channels: {
        messages: {
          reducer: (current: BaseMessage[], update: BaseMessage[]) => {
            return [...current, ...update];
          },
          default: () => [],
        },
        pendingFieldNote: {
          reducer: (current, update) => update ?? current,
          default: () => undefined,
        },
        toolCallCount: {
          reducer: (_current, update) => update ?? 0,
          default: () => 0,
        },
        lastToolCalls: {
          reducer: (_current, update) => update ?? [],
          default: () => [],
        },
        pendingAction: {
          reducer: pendingActionReducer,
          default: () => undefined,
        },
      },
    })
      .addNode('agent', agentNode)
      .addNode('guard', guardNode)
      .addNode('analysis_tools', analysisToolsNode)
      .addNode('save_tools', saveToolsNode)
      .addEdge(START, 'agent')
      .addEdge('agent', 'guard')
      .addConditionalEdges('guard', shouldContinue)
      .addEdge('analysis_tools', 'agent')
      .addEdge('save_tools', 'agent');

    // Compile with checkpointer for persistence across requests
    // ONLY interrupt before save_tools (not analysis_tools)
    return workflow.compile({
      checkpointer: this.checkpointer,
      interruptBefore: ['save_tools'], // Only pause before SAVE operations
    }) as FieldNoteAgentApp;
  }
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

function buildFieldNoteLoopStopMessage(
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
