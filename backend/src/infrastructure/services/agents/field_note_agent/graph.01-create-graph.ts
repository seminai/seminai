import { StateGraph, END, START } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { AgentState } from './types';
import { createClassifyFieldNoteDataTool, createFindUserCompaniesTool, createFindUserFieldsTool, createFindUserProductionUnitsTool, createFindUserProductsTool, createSaveFieldNoteTool, createSaveStockInPurchaseTool, createSaveStockInHarvestTool, createSaveStockOutSaleTool, createSaveStockOutTreatmentTool, createExtractGpsFromImageTool, createCountUserFieldNotesTool, createListUserFieldNotesTool, createGetUserFieldNoteByIdTool } from './tools';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createCachedBdfClient, createBdfSearchProductDosesTool } from '../../integrations/bdf';
import { createBdfSearchProductsByAdversityWithCacheTool, createSearchBdfCachedProductsTool } from './bdfToolWrappers';
import { LOG_PREFIX } from './messages';
import type { FieldNoteAgentApp } from './ChatFieldNoteAgent';
import { TOOLS_REQUIRING_APPROVAL, prependFieldNoteSystemPrompt, pendingActionReducer, usageLogger, createFieldNoteGuardNode } from './graph.support';
import type { FieldNoteAgentGraphFactoryContext } from './graph.context';

export function fieldNoteAgentGraphFactoryCreateGraph(this: FieldNoteAgentGraphFactoryContext): FieldNoteAgentApp {
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
