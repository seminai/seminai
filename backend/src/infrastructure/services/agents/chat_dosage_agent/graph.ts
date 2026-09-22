import type { ChatOpenAI } from '@langchain/openai';
import { JobOperationsVectorStore } from './rag';
import { DisciplinariPdfVectorStore } from './rag/DisciplinariPdfVectorStore';
import { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../domain/repositories/IStockRepository';
import { createChatModel } from '../../llm-model-factory';
import { VALID_CHAT_MODELS, isValidChatModelName } from '../../llm-model-validation';
import { ChatModel } from './graph.support';
import type { AgentGraphFactoryContext } from './graph.context';
import { agentGraphFactoryCreateGraph } from './graph.01-create-graph';

export { DESTRUCTIVE_TOOLS, type ChatModel } from './graph.support';
export { VALID_CHAT_MODELS };

/**
 * Factory class for creating the LangGraph agent workflow.
 * Implements human-in-the-loop pattern with an approval gate for destructive tools only.
 * Read-only tools execute automatically; destructive tools pause for user approval
 * (unless requireApproval is explicitly set to false for bulk/batch operations).
 */
export class AgentGraphFactory {

  readonly model: ChatOpenAI;
  readonly tavilyApiKey?: string;
  readonly userId?: string;
  readonly jobId?: string;
  readonly workspaceId?: string;
  readonly threadId?: string;
  readonly jobOperationsVectorStore?: JobOperationsVectorStore;
  readonly disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  readonly modelName: string;
  readonly requireApproval: boolean;
  readonly userInfo?: { name: string; email: string };
  readonly jobRepository?: IJobRepository;
  readonly stockRepository?: IStockRepository;

  /**
   * Creates a new AgentGraphFactory instance.
   * @param options Configuration options for the agent
   */
  constructor(
    options: {
      modelName?: ChatModel;
      temperature?: number;
      tavilyApiKey?: string;
      openAIApiKey?: string;
      userId?: string;
      jobId?: string;
      /** Workspace ID for workspace-level rule search */
      workspaceId?: string;
      /** Thread ID for working memory isolation (required for dosage pipeline tools). */
      threadId?: string;
      /** Vector store for semantic search over job operations */
      jobOperationsVectorStore?: JobOperationsVectorStore;
      /**
       * Vector store for semantic search over official disciplinari PDFs from BDF.
       * PDFs are fetched on-demand and cached in memory.
       */
      disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
      /**
       * When true (default), the graph pauses before destructive tool execution
       * (update_job, create_job, optimize_selected_jobs, merge_treatment_dates)
       * so the user can review and approve each modification.
       * Read-only tools always execute automatically.
       * Set to false to skip approval even for destructive tools (batch mode).
       * @default true
       */
      requireApproval?: boolean;
      /** User display info used to attribute AI-assisted job modifications in history. */
      userInfo?: { name: string; email: string };
      /** Job repository required to enable update_job and create_job tools. */
      jobRepository?: IJobRepository;
      /** Stock repository required to enable update_job and create_job tools. */
      stockRepository?: IStockRepository;
    } = {},
  ) {
    const modelName = options.modelName || 'gpt-4o-mini';
    if (!isValidChatModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Must be one of: ${VALID_CHAT_MODELS.join(', ')}`,
      );
    }

    const userPart = options.userId ?? 'anon';
    const workspacePart = options.workspaceId ?? 'default';
    const created = createChatModel({
      modelName,
      temperature: options.temperature ?? 0,
      maxTokens: 4000,
      promptCacheKey: `seminai-chat-dosage:${userPart}:${workspacePart}`,
    });
    this.model = created.model;

    this.tavilyApiKey = options.tavilyApiKey || process.env.TAVILY_API_KEY;
    this.userId = options.userId;
    this.jobId = options.jobId;
    this.workspaceId = options.workspaceId;
    this.threadId = options.threadId;
    this.jobOperationsVectorStore = options.jobOperationsVectorStore;
    this.disciplinariPdfVectorStore = options.disciplinariPdfVectorStore;
    this.modelName = created.modelName;
    this.requireApproval = options.requireApproval ?? true;
    this.userInfo = options.userInfo;
    this.jobRepository = options.jobRepository;
    this.stockRepository = options.stockRepository;
  }

  /**
   * Creates and compiles the LangGraph workflow.
   *
   * Graph: START -> agent -> tools (read-only) -> agent -> ... -> END
   *                       -> approval_gate -> tools (destructive) -> agent -> ...
   *
   * When requireApproval is true the graph interrupts before the approval_gate
   * node, pausing only for destructive tool calls. Read-only tools execute
   * automatically. When false all tools execute without approval (batch mode).
   */
  public createGraph() {
    return agentGraphFactoryCreateGraph.call(this as unknown as AgentGraphFactoryContext);
  }
}
