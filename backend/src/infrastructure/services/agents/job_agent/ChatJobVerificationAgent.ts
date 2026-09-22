import { Runnable } from '@langchain/core/runnables';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { JobVerificationGraphFactory, ChatModel } from './graph';
import {
  JobVerificationAgentState,
  AgentResponse,
  SourceCitation,
  JobVerificationInput,
} from './types';

/**
 * Agent app type with state management methods.
 */
export type JobVerificationAgentApp = Runnable & {
  getState: (config: {
    configurable: { thread_id: string };
  }) => Promise<{ values: JobVerificationAgentState }>;
  updateState: (
    config: { configurable: { thread_id: string } },
    update: Partial<JobVerificationAgentState>,
  ) => Promise<unknown>;
};

/**
 * Options for creating an agent app.
 */
export interface CreateJobVerificationAgentOptions {
  modelName?: ChatModel;
  temperature?: number;
  tavilyApiKey?: string;
  openAIApiKey?: string;
  userId?: string;
}

/**
 * Creates a new job verification agent app instance.
 */
export function createJobVerificationAgentApp(
  options: CreateJobVerificationAgentOptions = {},
): JobVerificationAgentApp {
  const factory = new JobVerificationGraphFactory(options);
  return factory.createGraph();
}

/**
 * Handles a user message in the job verification context.
 */
export async function handleJobVerificationMessage(
  app: JobVerificationAgentApp,
  threadId: string,
  input: JobVerificationInput,
): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };

  try {
    // Build the user message with context
    let messageContent = input.message;

    // Add metadata context if present
    if (input.metadata) {
      const metadataContext: string[] = [];
      if (input.metadata.images?.length) {
        metadataContext.push(`[Immagini allegate: ${input.metadata.images.length}]`);
      }
      if (input.metadata.links?.length) {
        metadataContext.push(`[Link allegati: ${input.metadata.links.join(', ')}]`);
      }
      if (input.metadata.pdfs?.length) {
        metadataContext.push(`[PDF allegati: ${input.metadata.pdfs.length}]`);
      }
      if (metadataContext.length > 0) {
        messageContent = `${metadataContext.join(' ')}\n\n${messageContent}`;
      }
    }

    const inputs = {
      messages: [new HumanMessage(messageContent)],
      jobs: input.jobs,
      metadata: input.metadata,
    };

    // Run until the graph pauses or finishes
    const stream = await app.stream(inputs, config);

    for await (const event of stream) {
      void event;
      // Events are processed automatically by LangGraph
    }

    // Check current state
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    // Check if human input is required (modification proposal)
    if (state.requiresHumanInput && state.pendingAction) {
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        message: "L'agente ha proposto una modifica che richiede la tua approvazione.",
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Check for pending tool calls
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      return {
        status: 'REQUIRES_APPROVAL',
        message: "L'agente richiede l'approvazione per eseguire un tool.",
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }

    // Completed
    const finalMessage =
      state.finalAnswer ||
      (lastMessage instanceof AIMessage ? lastMessage.content?.toString() : undefined) ||
      'Elaborazione completata.';

    return {
      status: 'COMPLETED',
      message: finalMessage,
      reasoning: state.reasoning,
      tasks: state.tasks,
      sources: state.sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Errore durante l'elaborazione: ${errorMessage}`,
    };
  }
}

/**
 * Approves a pending action and resumes execution.
 */
export async function approveJobVerificationAction(
  app: JobVerificationAgentApp,
  threadId: string,
): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };

  try {
    // Resume execution
    const stream = await app.stream(null, config);

    for await (const event of stream) {
      void event;
      // Stream processing
    }
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;
    // Check if more human input is required
    if (state.requiresHumanInput && state.pendingAction) {
      return {
        status: 'REQUIRES_MODIFICATION_APPROVAL',
        message: "L'agente ha proposto un'altra modifica che richiede approvazione.",
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };
    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      return {
        status: 'REQUIRES_APPROVAL',
        message: "L'agente richiede l'approvazione per un'altra azione.",
        pendingAction: state.pendingAction,
        tasks: state.tasks,
        sources: state.sources,
      };
    }
    return {
      status: 'COMPLETED',
      message: state.finalAnswer || 'Azione approvata ed eseguita con successo.',
      reasoning: state.reasoning,
      tasks: state.tasks,
      sources: state.sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Errore durante l'approvazione: ${errorMessage}`,
    };
  }
}
/**
 * Rejects a pending action and provides feedback.
 */
export async function rejectJobVerificationAction(
  app: JobVerificationAgentApp,
  threadId: string,
  reason: string,
): Promise<AgentResponse> {
  const config = { configurable: { thread_id: threadId } };
  try {
    const rejectionMessage = new HumanMessage(
      `L'azione è stata rifiutata dall'utente. Motivo: ${reason}. Per favore, proponi un'alternativa o chiedi chiarimenti.`,
    );
    await app.updateState(config, {
      messages: [rejectionMessage],
      requiresHumanInput: false,
      pendingAction: undefined,
    });
    // Resume execution
    const stream = await app.stream(null, config);
    for await (const event of stream) {
      void event;
      // Stream processing
    }
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    return {
      status: 'COMPLETED',
      message: lastMessage?.content?.toString() || "Azione rifiutata. L'agente è stato informato.",
      reasoning: state.reasoning,
      tasks: state.tasks,
      sources: state.sources,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: `Errore durante il rifiuto: ${errorMessage}`,
    };
  }
}
/**
 * Gets the current conversation state for a thread.
 */
export async function getJobVerificationAgentState(
  app: JobVerificationAgentApp,
  threadId: string,
): Promise<JobVerificationAgentState> {
  const config = { configurable: { thread_id: threadId } };
  const stateSnapshot = await app.getState(config);
  return stateSnapshot.values;
}
/**
 * Extracts source citations from messages.
 */
export function extractSourcesFromMessages(messages: BaseMessage[]): SourceCitation[] {
  const sources: SourceCitation[] = [];
  for (const message of messages) {
    if (message instanceof ToolMessage) {
      const content = message.content.toString();
      // Try to parse JSON response
      try {
        const parsed = JSON.parse(content);
        if (parsed.source) {
          sources.push({
            url: parsed.source.url || '',
            title: parsed.source.title || 'Document',
            description: parsed.source.description || '',
          });
        }
      } catch {
        // Not JSON, try to extract from text
        const sourceRegex =
          /\[SOURCE_(\d+)\]\s*Title:\s*(.+?)\s*URL:\s*(.+?)\s*Content:[\s\S]*?Fragment:\s*(.+?)(?=\n---|\n\[SOURCE_|$)/gs;
        let match;
        while ((match = sourceRegex.exec(content)) !== null) {
          const [, , title, url, fragment] = match;
          if (title && url) {
            sources.push({
              url: url.trim(),
              title: title.trim(),
              description: fragment?.trim() || '',
            });
          }
        }
      }
    }
  }
  // Deduplicate by URL
  const uniqueSources = sources.filter(
    (source, index, self) => index === self.findIndex((s) => s.url === source.url),
  );
  return uniqueSources;
}
