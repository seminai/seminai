import { Runnable } from '@langchain/core/runnables';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { FieldNoteAgentGraphFactory, ChatModel } from './graph';
import type { AgentState, AgentResponse } from './types';
import { PrismaClient } from '@prisma/client';
import { FIELD_NOTE_MESSAGES, LOG_PREFIX } from './messages';
import { cancelPendingToolCalls } from '../shared/hitl/cancel-pending-tool-calls';
import { createFieldNoteRunConfig, type FieldNoteRunConfig } from './runtime';

export { approveAndExecute, rejectAndRespond, getConversationState } from './field-note-operations';

/**
 * Agent app type with state management methods.
 */
export type FieldNoteAgentApp = Runnable & {
  getState: (config: FieldNoteRunConfig) => Promise<{ values: AgentState }>;
  updateState: (
    config: FieldNoteRunConfig,
    update: Partial<AgentState>,
    asNode?: string,
  ) => Promise<unknown>;
};

/**
 * Options for creating a field note agent app.
 */
export interface CreateFieldNoteAgentAppOptions {
  modelName?: ChatModel;
  temperature?: number;
  openAIApiKey?: string;
  userId: string;
  prisma: PrismaClient;
  threadId?: string;
  /**
   * Optional LangGraph checkpointer. When omitted the graph falls back to a
   * fresh MemorySaver (state lost on restart). The FieldNoteAgentRegistry
   * passes the shared Postgres checkpointer so the sub-agent state survives
   * server restarts. See `agents/shared/checkpointer-factory.ts`.
   */
  checkpointer?: BaseCheckpointSaver;
}

/**
 * Creates a new field note agent app instance.
 * @param options Configuration options
 * @returns The agent app with state management capabilities
 */
export function createFieldNoteAgentApp(
  options: CreateFieldNoteAgentAppOptions,
): FieldNoteAgentApp {
  const factory = new FieldNoteAgentGraphFactory(options);
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
 * @returns Promise resolving to the agent's response
 */
export async function handleUserMessage(
  app: FieldNoteAgentApp,
  threadId: string,
  userMessage: string,
): Promise<AgentResponse> {
  const config = createFieldNoteRunConfig(threadId);

  try {
    console.log(`${LOG_PREFIX.HANDLER} Starting for thread: ${threadId}`);
    console.log(`${LOG_PREFIX.HANDLER} User message: "${userMessage}"`);

    // Cancel stale pending tool_calls before injecting new message.
    // Without this, an AIMessage with tool_calls followed by a HumanMessage causes
    // INVALID_TOOL_RESULTS errors from OpenAI.
    try {
      await cancelPendingToolCalls({
        app: app as unknown as import('../shared/hitl/types').HitlAgentApp,
        config,
        reason: 'Nuovo messaggio utente ricevuto, operazione precedente annullata.',
        asNode: 'save_tools',
      });
    } catch {
      console.log(`${LOG_PREFIX.HANDLER} No existing state for thread (new conversation)`);
    }

    const inputs: Partial<AgentState> = {
      messages: [new HumanMessage(userMessage)],
      toolCallCount: 0,
      lastToolCalls: [],
    };

    console.log(`${LOG_PREFIX.HANDLER} Streaming agent...`);
    // Run until the graph pauses or finishes
    const stream = await app.stream(inputs, config);

    // Process all events to reach the final state
    let eventCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of stream) {
      eventCount++;
      console.log(`${LOG_PREFIX.HANDLER} Event ${eventCount} received`);
      // Events are processed automatically by LangGraph
      // We just need to consume the stream
    }

    console.log(`${LOG_PREFIX.HANDLER} Stream completed with ${eventCount} events`);
    console.log(`${LOG_PREFIX.HANDLER} Getting state snapshot...`);

    // Check current state to see if we are paused at 'tools'
    const stateSnapshot = await app.getState(config);
    const state = stateSnapshot.values;

    console.log(`${LOG_PREFIX.HANDLER} State has ${state.messages.length} messages`);

    // Extract the last AI message
    const lastMessage = state.messages[state.messages.length - 1];
    console.log(`${LOG_PREFIX.HANDLER} Last message type: ${lastMessage.constructor.name}`);

    // If we're paused and there are pending tool calls
    if (lastMessage instanceof AIMessage && lastMessage.tool_calls) {
      const toolCalls = lastMessage.tool_calls;
      console.log(`${LOG_PREFIX.HANDLER} Found ${toolCalls.length} pending tool calls`);

      if (toolCalls.length > 0) {
        // Filter save_field_note tool calls for bulk detection
        const saveFieldNoteCalls = toolCalls.filter((tc) => tc.name === 'save_field_note');

        let messageContent = '';

        if (saveFieldNoteCalls.length > 1) {
          // BULK OPERATION: Multiple field notes to save
          console.log(
            `${LOG_PREFIX.HANDLER} Detected bulk save operation (${saveFieldNoteCalls.length} notes)`,
          );

          // Extract field names from tool call args
          const fieldNames = saveFieldNoteCalls
            .map((tc) => {
              const args = tc.args as Record<string, unknown>;
              const extractedData = args.extractedData as Record<string, unknown> | undefined;
              const recognizedFields = extractedData?.recognizedFields as
                | Array<{ name?: string }>
                | undefined;
              return recognizedFields?.[0]?.name || 'Campo sconosciuto';
            })
            .filter((name) => name !== 'Campo sconosciuto');

          const firstCallArgs = saveFieldNoteCalls[0].args as Record<string, unknown>;

          messageContent = FIELD_NOTE_MESSAGES.CONFIRM_BULK_SAVE({
            count: saveFieldNoteCalls.length,
            category: (firstCallArgs.category as string) || 'nota di campo',
            rawContent: (firstCallArgs.rawContent as string) || '',
            fieldNames:
              fieldNames.length > 0 ? fieldNames : Array(saveFieldNoteCalls.length).fill('Campo'),
          });
        } else if (saveFieldNoteCalls.length === 1) {
          // SINGLE SAVE_FIELD_NOTE: Use existing detailed message
          const toolArgs = saveFieldNoteCalls[0].args as Record<string, unknown>;

          console.log(`${LOG_PREFIX.HANDLER} Tool call: save_field_note`);
          console.log(`${LOG_PREFIX.HANDLER} Tool call args:`, toolArgs);

          const extractedData = toolArgs.extractedData as Record<string, unknown> | undefined;
          const recognizedFields = extractedData?.recognizedFields as
            | Array<{ name?: string }>
            | undefined;
          const recognizedProducts =
            (extractedData?.recognizedProducts as Array<{ name?: string }>) ?? [];
          const fieldName = recognizedFields?.[0]?.name;
          const productName =
            recognizedProducts?.[0]?.name || (toolArgs.productName as string | undefined);

          const fallbackMessage = FIELD_NOTE_MESSAGES.CONFIRM_SAVE_WITH_DETAILS({
            category: (toolArgs.category as string) || 'nota di campo',
            rawContent: (toolArgs.rawContent as string) || '',
            fieldName,
            productName,
            quantity: toolArgs.quantity as number | undefined,
            unitOfMeasure: toolArgs.unitOfMeasure as string | undefined,
          });

          messageContent = lastMessage.content ? String(lastMessage.content) : fallbackMessage;
        } else {
          // OTHER TOOL (not save_field_note)
          const toolName = toolCalls[0].name;
          const toolArgs = toolCalls[0].args as Record<string, unknown>;

          console.log(`${LOG_PREFIX.HANDLER} Tool call: ${toolName}`);
          console.log(`${LOG_PREFIX.HANDLER} Tool call args:`, toolArgs);

          messageContent = lastMessage.content
            ? String(lastMessage.content)
            : FIELD_NOTE_MESSAGES.TOOL_EXECUTION_REQUEST(toolName);
        }

        console.log(`${LOG_PREFIX.HANDLER} Message content:`, lastMessage.content);
        console.log(`${LOG_PREFIX.HANDLER} Message content type:`, typeof lastMessage.content);

        const response = {
          status: 'REQUIRES_APPROVAL' as const,
          message: messageContent,
          pendingToolCalls: toolCalls.map((tc) => ({
            name: tc.name,
            args: tc.args as Record<string, unknown>,
            id: tc.id || '',
          })),
        };

        console.log(`${LOG_PREFIX.HANDLER} Returning response:`, JSON.stringify(response, null, 2));
        return response;
      }
    }

    // If no tool calls are pending, the agent has completed its response
    if (lastMessage instanceof AIMessage) {
      console.log(`${LOG_PREFIX.HANDLER} Agent completed without approval needed`);
      return {
        status: 'COMPLETED',
        message: lastMessage.content as string,
      };
    }

    // Fallback
    console.log(`${LOG_PREFIX.HANDLER} Fallback response`);
    return {
      status: 'COMPLETED',
      message: FIELD_NOTE_MESSAGES.CONVERSATION_COMPLETED,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX.HANDLER} Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      status: 'ERROR',
      error: errorMessage,
    };
  }
}
