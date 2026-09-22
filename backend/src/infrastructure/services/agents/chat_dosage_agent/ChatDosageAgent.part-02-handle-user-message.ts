import type { AgentState } from './types';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentApp, AgentResponse } from './ChatDosageAgent.part-01-agent-response-status';
import { extractSourcesFromMessages } from './ChatDosageAgent.part-03-reject-action';

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
