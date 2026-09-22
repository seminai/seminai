import { Runnable } from '@langchain/core/runnables';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { AgentGraphFactory, ChatModel } from './graph';
import type { AgentState, SourceCitation } from './types';
import { createJobOperationsVectorStore, JobOperationsVectorStore } from './rag';
import {
  DisciplinariPdfVectorStore,
  BDF_DISCIPLINARI_CATALOG,
} from './rag/DisciplinariPdfVectorStore';
import { prisma } from '../../../repositories/Prisma';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { IJobRepository } from '../../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../../domain/repositories/IStockRepository';

/**
 * Response status indicating the current state of the agent execution.
 */
export type AgentResponseStatus = 'COMPLETED' | 'REQUIRES_APPROVAL' | 'ERROR';

/**
 * Response from the agent after processing a message.
 */
export interface AgentResponse {
  status: AgentResponseStatus;
  message?: string;
  pendingToolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
  }>;
  sources?: SourceCitation[];
  error?: string;
}

/**
 * Agent app type with state management methods.
 */
export type AgentApp = Runnable & {
  getState: (config: { configurable: { thread_id: string } }) => Promise<{ values: AgentState }>;
  updateState: (
    config: { configurable: { thread_id: string } },
    update: Partial<AgentState>,
  ) => Promise<unknown>;
};

/**
 * Options for creating an agent app.
 */
export interface CreateAgentAppOptions {
  modelName?: ChatModel;
  temperature?: number;
  tavilyApiKey?: string;
  openAIApiKey?: string;
  userId?: string;
  /** Job ID for geographic validation of Tavily search results */
  jobId?: string;
  /** Workspace ID for workspace-level rule search */
  workspaceId?: string;
  /** Thread ID for working memory isolation (required for dosage pipeline tools). */
  threadId?: string;
  /** Pre-initialized vector store for job operations search (optional, will be created if jobId is provided) */
  jobOperationsVectorStore?: JobOperationsVectorStore;
  /** Skip RAG initialization even if jobId is provided */
  skipRAG?: boolean;
  /**
   * When true (default), the agent pauses before every tool call for human approval.
   * Set to false to allow autonomous tool execution — useful for bulk/batch job modifications.
   * @default true
   */
  requireApproval?: boolean;
  /**
   * User display info for attributing AI-assisted job modifications in the job history.
   * Required to enable the update_job and create_job tools.
   */
  userInfo?: { name: string; email: string };
  /**
   * Job repository implementation. Required to enable update_job and create_job tools.
   * When not provided those tools are not added to the agent.
   */
  jobRepository?: IJobRepository;
  /**
   * Stock repository implementation. Required to enable update_job and create_job tools.
   */
  stockRepository?: IStockRepository;
  /**
   * Pre-initialized disciplinari PDF vector store.
   * When not provided a new one is created automatically from the BDF catalog.
   */
  disciplinariPdfVectorStore?: DisciplinariPdfVectorStore;
  /**
   * Skip creation of the disciplinari PDF vector store.
   * When true the search_disciplinari_bdf_pdf tool is not added.
   * @default false
   */
  skipDisciplinariPdf?: boolean;
}

/**
 * Creates a new agent app instance.
 *
 * Initialization steps (all gracefully degraded on failure):
 * 1. Job Operations RAG — loads and indexes operations for the jobId (if provided and skipRAG=false).
 * 2. Disciplinari PDF Vector Store — creates a lazy store from the BDF catalog (if skipDisciplinariPdf=false).
 * 3. Job modification tools — enabled when userId + userInfo + jobRepository + stockRepository are provided.
 * 4. Approval mode — controlled by requireApproval (default true). Set to false for batch/bulk operations.
 *
 * @param options Configuration options
 * @returns The agent app with state management capabilities
 */
export async function createAgentApp(options: CreateAgentAppOptions = {}): Promise<AgentApp> {
  let jobOperationsVectorStore = options.jobOperationsVectorStore;

  // Initialize job operations RAG if jobId and userId are provided and no vector store is passed
  if (options.jobId && options.userId && !jobOperationsVectorStore && !options.skipRAG) {
    try {
      console.log(`[createAgentApp] Initializing RAG for jobId: ${options.jobId}`);

      const jobRepo = new PrismaJobRepository(prisma);
      const operations = await jobRepo.findManyByUserIdWithAssignmentWithoutHistory(
        options.userId,
        undefined,
        options.jobId,
      );

      if (operations.length > 0) {
        console.log(`[createAgentApp] Found ${operations.length} operations, indexing...`);
        jobOperationsVectorStore = await createJobOperationsVectorStore(operations, options.jobId);
        console.log(`[createAgentApp] RAG initialization complete`);
      } else {
        console.log(`[createAgentApp] No operations found for jobId: ${options.jobId}`);
      }
    } catch (error) {
      console.error(`[createAgentApp] Failed to initialize RAG:`, error);
      // Continue without RAG — don't fail the entire agent creation
    }
  }

  // Initialize disciplinari PDF vector store (lazy — no downloads at boot)
  let disciplinariPdfVectorStore = options.disciplinariPdfVectorStore;
  if (!disciplinariPdfVectorStore && !options.skipDisciplinariPdf) {
    disciplinariPdfVectorStore = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
    console.log(
      `[createAgentApp] Disciplinari PDF vector store ready (${BDF_DISCIPLINARI_CATALOG.length} entries in catalog, lazy fetch)`,
    );
  }

  const factory = new AgentGraphFactory({
    ...options,
    jobOperationsVectorStore,
    disciplinariPdfVectorStore,
  });
  return factory.createGraph();
}

/**
 * Handles a user message.
 * If the agent decides to run a tool, it will PAUSE before execution
 * due to 'interruptBefore' configuration, requiring human approval.
 *
 * @param app The agent app instance
 * @param threadId Unique identifier for the conversation thread
 * @param userMessage The user's message
 * @param jobId Optional job ID to provide context to the agent
 * @returns Promise resolving to the agent's response
 */
export async function handleUserMessage(
  app: AgentApp,
  threadId: string,
  userMessage: string,
  jobId?: string,
): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };

  try {
    // Optionally prepend job context information if jobId is provided
    let messageContent = userMessage;
    if (jobId) {
      messageContent = `[Context: Current Job ID is ${jobId}. You can use the get_job_details tool with this ID to retrieve job information.]\n\n${userMessage}`;
    }

    const inputs: Partial<AgentState> = {
      messages: [new HumanMessage(messageContent)],
    };

    // Run until the graph pauses or finishes
    const stream = await app.stream(inputs, config);

    // Process all events to reach the final state
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      // Events are processed automatically by LangGraph
      // We just need to consume the stream
    }

    // Check current state to see if we are paused at 'approval_gate'
    const stateSnapshot = await app.getState(config);

    // Check if there are pending destructive tool calls (interrupt before approval_gate)
    const messages = stateSnapshot.values.messages;
    if (!messages || messages.length === 0) {
      return {
        status: 'COMPLETED',
        message: 'No response generated.',
      };
    }

    const lastMessage = messages[messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      return {
        status: 'REQUIRES_APPROVAL',
        message: 'The agent requires approval to execute a tool. Please review the pending action.',
        pendingToolCalls: lastMessage.tool_calls,
      };
    }

    // Agent completed without needing tools
    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;

    // Extract sources from tool messages if any were used
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);

    return {
      status: 'COMPLETED',
      message: lastAIMessage?.content?.toString() || 'No response generated',
      sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Failed to process message: ${errorMessage}`,
    };
  }
}

/**
 * Approves the pending action and resumes execution.
 * This function should be called when the human approves the tool execution.
 *
 * @param app The agent app instance
 * @param threadId Unique identifier for the conversation thread
 * @returns Promise resolving to the agent's response after tool execution
 */
export async function approveAction(app: AgentApp, threadId: string): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };

  try {
    // Resume execution (proceed to 'tools' node)
    // Passing null as input resumes from the saved state
    const stream = await app.stream(null, config);

    // Process all events to completion
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      // Stream processing
    }

    // Get final state
    const stateSnapshot = await app.getState(config);

    // Find the last AI message with the final response
    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;

    // Check if there are more tool calls (chain of tool usage)
    const hasMoreToolCalls =
      lastAIMessage &&
      'tool_calls' in lastAIMessage &&
      Array.isArray(lastAIMessage.tool_calls) &&
      lastAIMessage.tool_calls.length > 0;

    if (hasMoreToolCalls) {
      const toolCalls = (
        lastAIMessage as AIMessage & {
          tool_calls?: Array<{
            name: string;
            args: Record<string, unknown>;
            id: string;
          }>;
        }
      ).tool_calls;
      return {
        status: 'REQUIRES_APPROVAL',
        message: 'Tool executed. Agent requires approval for another action.',
        pendingToolCalls: toolCalls,
      };
    }

    // Extract sources from tool messages if any were used
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);

    return {
      status: 'COMPLETED',
      message: lastAIMessage?.content?.toString() || 'Action completed successfully',
      sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Failed to approve action: ${errorMessage}`,
    };
  }
}

/**
 * Rejects the pending action and provides feedback to the agent.
 * The agent will receive the rejection message and can adjust its behavior.
 *
 * @param app The agent app instance
 * @param threadId Unique identifier for the conversation thread
 * @param reason Reason for rejection
 * @returns Promise resolving to the agent's response
 */
export async function rejectAction(
  app: AgentApp,
  threadId: string,
  reason: string,
): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };

  try {
    // Inject a message telling the agent the action was rejected
    const rejectionMessage = new HumanMessage(
      `The previous tool execution was rejected. Reason: ${reason}. Please adjust your approach and provide an alternative solution.`,
    );

    // Update state with rejection message
    await app.updateState(config, {
      messages: [rejectionMessage],
    });

    // Resume execution - agent will see the rejection and adjust
    const stream = await app.stream(null, config);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      // Stream processing
    }

    // Get final state
    const stateSnapshot = await app.getState(config);

    const lastAIMessage = stateSnapshot.values.messages
      .slice()
      .reverse()
      .find((msg) => msg instanceof AIMessage) as AIMessage | undefined;

    // Extract sources from tool messages if any were used
    const sources = extractSourcesFromMessages(stateSnapshot.values.messages);

    return {
      status: 'COMPLETED',
      message: lastAIMessage?.content?.toString() || 'Action rejected. Agent has been notified.',
      sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Failed to reject action: ${errorMessage}`,
    };
  }
}

/**
 * Gets the current conversation state for a thread.
 * Useful for debugging or displaying conversation history.
 *
 * @param app The agent app instance
 * @param threadId Unique identifier for the conversation thread
 * @returns Promise resolving to the current agent state
 */
export async function getAgentState(app: AgentApp, threadId: string): Promise<AgentState> {
  const config = { configurable: { thread_id: threadId } };
  const stateSnapshot = await app.getState(config);
  return stateSnapshot.values;
}

/**
 * Extracts source citations from tool messages in the conversation.
 * Parses Tavily search results to extract URLs, titles, and fragments.
 *
 * @param messages Array of messages from the conversation
 * @returns Array of source citations
 */
export function extractSourcesFromMessages(messages: BaseMessage[]): SourceCitation[] {
  const sources: SourceCitation[] = [];

  for (const message of messages) {
    if (message instanceof ToolMessage && message.name === 'tavily_scientific_search') {
      const content = message.content.toString();
      // Parse the structured format from the tool response
      // Format: [SOURCE_1]\nTitle: ...\nURL: ...\nContent: ...\nFragment: ...
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

      // Fallback: try to extract from less structured format
      if (sources.length === 0) {
        const urlRegex = /URL:\s*(https?:\/\/[^\s\n]+)/g;
        const titleRegex = /Title:\s*(.+?)(?:\n|$)/g;
        const urlMatches = Array.from(content.matchAll(urlRegex));
        const titleMatches = Array.from(content.matchAll(titleRegex));

        for (let i = 0; i < Math.min(urlMatches.length, titleMatches.length); i++) {
          const url = urlMatches[i][1];
          const title = titleMatches[i][1].trim();
          // Extract a fragment from the content section
          const contentMatch = content.match(
            new RegExp(
              `Title:\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?Content:\\s*(.+?)(?=\\n---|\\nTitle:|$)`,
              'i',
            ),
          );
          const fragment = contentMatch
            ? contentMatch[1].substring(0, 200).trim()
            : 'Source content fragment';

          sources.push({
            title,
            url,
            fragment,
          });
        }
      }
    }
  }

  return sources;
}
