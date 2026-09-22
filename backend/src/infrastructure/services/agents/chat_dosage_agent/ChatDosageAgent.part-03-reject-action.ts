import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import type { AgentState, SourceCitation } from './types';
import { AgentApp, AgentResponse } from './ChatDosageAgent.part-01-agent-response-status';

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
