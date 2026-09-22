import { StateGraph, END, START, BaseCheckpointSaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { ChatOpenAI } from '@langchain/openai';
import { CompanyKind } from '@prisma/client';
import {
  buildSystemPrompt,
  type AgentPromptDomain,
  type SystemPromptOptions,
} from '../prompt/system-prompt';
import { routeAfterAgent, createRouteAfterGuard, routeAfterTools } from './routing';
import { createAgentNode, createGuardNode, createApprovalGateNode } from './nodes';
import type { AgentNodeModel } from './agent-model-selector';
import { createTaskPlannerNode } from './task-planner-node';
import { createAutoCriticNode } from './auto-critic-node';
import { createContextCompressorNode } from '../memory/context-compressor';
import { LoopDetector } from '../loop-detector';
import {
  createModelForTask,
  type ModelProvider,
  type ModelSelection,
  type TaskComplexity,
} from '../../shared/modelRouter';
import { buildToolsForBundle, resolveToolBundle, type ToolBundle } from './tool-registry';
import { DosageReactAnnotation } from './graph-state';
import { JobOperationsVectorStore, DisciplinariPdfVectorStore } from '../search-tools';
import { DOSAGE_REACT_MAX_TOKENS, buildPromptCacheKey } from './llm-tuning.constant';
import type { AgentApp } from '../DosageReactAgent';
import type { DosageAgentContext } from '../../dosage_agent/context';
import type { IJobRepository } from '../../../../../domain/repositories/IJobRepository';
import type { IStockRepository } from '../../../../../domain/repositories/IStockRepository';
import { createDosageReactCheckpointer } from './checkpointer-factory';

export {
  DEFAULT_REACT_MODEL,
  VALID_REACT_MODELS,
  type ReactChatModel,
} from './valid-models.constant';

export interface DosageReactGraphOptions {
  threadId: string;
  chatId?: string;
  modelName?: string;
  temperature?: number;
  openAIApiKey?: string;
  tavilyApiKey?: string;
  userId?: string;
  jobId?: string;
  workspaceId?: string;
  jobOperationsVectorStore?: JobOperationsVectorStore;
  disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  requireApproval?: boolean;
  context?: DosageAgentContext;
  preferredProvider?: ModelProvider;
  userInfo?: { name: string; email: string };
  jobRepository?: IJobRepository;
  stockRepository?: IStockRepository;
  /** Client-driven context (e.g. embedded form-editor mode). Passed to tool registry. */
  clientContext?: Record<string, unknown>;
  /** Explicit tool bundle override. When omitted, resolved deterministically from jobId. */
  toolBundle?: ToolBundle;
  /** Agent domain. Drives persona/prompt + capability flags. Defaults to DOSAGE (agronomic). */
  domain?: AgentPromptDomain;
}

/**
 * Factory class for creating the Dosage ReAct Agent LangGraph workflow.
 *
 * Graph structure:
 *   START → agent → guard → tools → agent → ... → END
 *                         ↘ approval_gate → tools (for destructive ops)
 */
export class DosageReactGraphFactory {
  private readonly modelSelections: Record<TaskComplexity, ModelSelection>;
  private readonly threadId: string;
  private readonly chatId?: string;
  private readonly modelName: string;
  private readonly provider: ModelProvider;
  private readonly requireApproval: boolean;
  private readonly userId?: string;
  private readonly jobId?: string;
  private readonly workspaceId?: string;
  private readonly tavilyApiKey?: string;
  private readonly jobOperationsVectorStore?: JobOperationsVectorStore;
  private readonly disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  private readonly context?: DosageAgentContext;
  private readonly userInfo?: { name: string; email: string };
  private readonly jobRepository?: IJobRepository;
  private readonly stockRepository?: IStockRepository;
  private readonly clientContext?: Record<string, unknown>;
  private readonly toolBundle: ToolBundle;
  private readonly domain: AgentPromptDomain;

  constructor(options: DosageReactGraphOptions) {
    this.domain = options.domain ?? 'DOSAGE';
    this.toolBundle = resolveToolBundle({
      jobId: options.jobId,
      forcedBundle: options.toolBundle,
    });
    const promptCacheKey = buildPromptCacheKey({
      userId: options.userId,
      workspaceId: options.workspaceId,
      bundle: this.toolBundle,
    });
    const modelConfig = {
      preferredProvider: options.preferredProvider,
      modelName: options.modelName,
      temperature: options.temperature,
      maxTokens: DOSAGE_REACT_MAX_TOKENS,
      promptCacheKey,
    };
    this.modelSelections = {
      low: createModelForTask('low', modelConfig),
      medium: createModelForTask('medium', modelConfig),
      high: createModelForTask('high', modelConfig),
    };
    this.modelName = this.modelSelections.medium.modelName;
    this.provider = this.modelSelections.medium.provider;

    this.threadId = options.threadId;
    this.chatId = options.chatId;
    this.requireApproval = options.requireApproval ?? true;
    this.userId = options.userId;
    this.jobId = options.jobId;
    this.workspaceId = options.workspaceId;
    this.tavilyApiKey = options.tavilyApiKey || process.env.TAVILY_API_KEY;
    this.jobOperationsVectorStore = options.jobOperationsVectorStore;
    this.disciplinariPdfVectorStore = options.disciplinariPdfVectorStore;
    this.context = options.context;
    this.userInfo = options.userInfo;
    this.jobRepository = options.jobRepository;
    this.stockRepository = options.stockRepository;
    this.clientContext = options.clientContext;

    console.log(
      `[DosageReactGraph] Using provider: ${this.provider}, models: low=${this.modelSelections.low.modelName}, medium=${this.modelName}, high=${this.modelSelections.high.modelName}, bundle: ${this.toolBundle}`,
    );
  }

  private bindModels(
    tools: import('@langchain/core/tools').StructuredTool[],
  ): Record<TaskComplexity, AgentNodeModel> {
    const bindSelection = (selection: ModelSelection): AgentNodeModel => {
      const bindable = selection.model as unknown as {
        bindTools: (boundTools: import('@langchain/core/tools').StructuredTool[]) => ChatOpenAI;
      };
      return {
        modelWithTools: bindable.bindTools(tools),
        modelName: selection.modelName,
        provider: selection.provider,
        complexity: selection.complexity,
      };
    };
    return {
      low: bindSelection(this.modelSelections.low),
      medium: bindSelection(this.modelSelections.medium),
      high: bindSelection(this.modelSelections.high),
    };
  }

  /**
   * Assembles the uncompiled LangGraph workflow (nodes + edges) without a
   * checkpointer. Shared by {@link createGraph} (which compiles it with the
   * runtime checkpointer) and the LangGraph Studio entrypoint (which compiles
   * it without one, letting the dev server inject its own persistence).
   */
  public buildWorkflow() {
    const isManufacturing = this.domain === 'MANUFACTURING';
    const { tools, flags } = buildToolsForBundle(this.toolBundle, {
      threadId: this.threadId,
      chatId: this.chatId,
      userId: this.userId,
      jobId: this.jobId,
      workspaceId: this.workspaceId,
      tavilyApiKey: this.tavilyApiKey,
      jobOperationsVectorStore: this.jobOperationsVectorStore,
      disciplinariPdfVectorStore: this.disciplinariPdfVectorStore,
      context: this.context,
      userInfo: this.userInfo,
      jobRepository: this.jobRepository,
      stockRepository: this.stockRepository,
      clientContext: this.clientContext,
      companyKindFilter: isManufacturing ? CompanyKind.MANUFACTURING : undefined,
    });

    console.log(
      `[DosageReactGraph] Registered ${tools.length} tools (${this.toolBundle}): ${tools.map((t) => t.name).join(', ')}`,
    );

    const modelsWithTools = this.bindModels(tools);
    const toolNames = tools.map((tool) => tool.name);

    const promptOptions: SystemPromptOptions = {
      domain: this.domain,
      hasRulesSearch: flags.hasRulesSearch,
      hasJobOperationsSearch: !!this.jobOperationsVectorStore?.hasDocuments(),
      hasDisciplinariPdf: flags.hasDisciplinariPdf,
      hasBdfTools: flags.hasBdfTools,
      hasTavilySearch: flags.hasTavilySearch,
      hasJobModification: !isManufacturing,
      hasContextDiscovery: flags.hasContextDiscovery,
      hasPlanning: !isManufacturing,
      hasFieldNoteDelegation: !isManufacturing && flags.hasContextDiscovery,
      hasProductLabelDb: !isManufacturing,
      hasEntityCreation: !isManufacturing && flags.hasContextDiscovery,
      hasConformityCheck: flags.hasConformityCheck,
      hasJobManagement: flags.hasJobManagement,
      hasProductRecommendation: flags.hasBdfTools,
      hasPhotoDiagnosis: !isManufacturing,
    };

    const loopDetector = new LoopDetector();
    const agentNode = createAgentNode({
      models: modelsWithTools,
      systemPromptText: buildSystemPrompt(promptOptions),
      threadId: this.threadId,
      userId: this.userId,
      jobId: this.jobId,
    });

    const workflow = new StateGraph(DosageReactAnnotation)
      .addNode('taskPlanner', createTaskPlannerNode(this.threadId))
      .addNode('agent', agentNode)
      .addNode(
        'guard',
        createGuardNode(loopDetector, {
          toolBundle: this.toolBundle,
          toolNames,
          threadId: this.threadId,
        }),
      )
      .addNode('approval_gate', createApprovalGateNode())
      .addNode('tools', new ToolNode(tools))
      .addNode('autoCritic', createAutoCriticNode())
      .addNode('contextCompressor', createContextCompressorNode(this.threadId, this.userId))
      .addEdge(START, 'taskPlanner')
      .addEdge('taskPlanner', 'agent');

    workflow.addConditionalEdges('agent', routeAfterAgent, { guard: 'guard', [END]: END });
    workflow.addConditionalEdges(
      'guard',
      createRouteAfterGuard(loopDetector, {
        toolBundle: this.toolBundle,
        toolNames,
      }),
      {
        execute: 'tools',
        approval_gate: 'approval_gate',
        [END]: END,
      },
    );
    workflow.addEdge('approval_gate', 'tools');

    // After tools: route to autoCritic for compute tools, or contextCompressor for others
    workflow.addConditionalEdges('tools', routeAfterTools, {
      autoCritic: 'autoCritic',
      contextCompressor: 'contextCompressor',
    });
    workflow.addEdge('autoCritic', 'contextCompressor');
    workflow.addEdge('contextCompressor', 'agent');

    return workflow;
  }

  public async createGraph(): Promise<{ app: AgentApp; checkpointer: BaseCheckpointSaver }> {
    const workflow = this.buildWorkflow();
    const checkpointer = await createDosageReactCheckpointer();
    const app = workflow.compile({
      checkpointer,
      ...(this.requireApproval ? { interruptBefore: ['approval_gate'] } : {}),
    }) as AgentApp;

    return { app, checkpointer };
  }
}
