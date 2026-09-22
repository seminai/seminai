import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { SourceCitation } from './types';
import { createInspectJobDataTool, createListJobPathsTool, extractSourcesFromToolContent } from './tools';
import { BaseMessage, ToolMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { truncateToolResult } from './context-manager';
import { StateAnnotation } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';

export function createToolNodeWithSources(
  this: JobVerificationGraphFactoryContext,
  staticTools: StructuredTool[]
) {

  /**
   * Tool execution node with source extraction and result truncation.
   * Creates dynamic tools with job context for inspection.
   * Truncates large tool results to prevent context overflow.
   */
  const toolNodeWithSources = async (
    state: typeof StateAnnotation.State,
  ): Promise<Partial<typeof StateAnnotation.State>> => {
    const { jobs, pendingAction } = state;

    // Create dynamic tools with job context
    const dynamicTools: StructuredTool[] = [
      ...staticTools,
      createInspectJobDataTool(jobs as unknown as { job: Record<string, unknown> }[]),
      createListJobPathsTool(jobs as unknown as { job: Record<string, unknown> }[]),
    ];

    const toolNode = new ToolNode(dynamicTools);
    const result = await toolNode.invoke(state);

    // Extract sources and truncate tool messages to prevent context overflow
    const newSources: SourceCitation[] = [];
    const truncatedMessages: BaseMessage[] = [];

    for (const msg of result.messages || []) {
      if (msg instanceof ToolMessage) {
        const content = msg.content.toString();

        // Extract sources before truncation
        const extracted = extractSourcesFromToolContent(content);
        newSources.push(...extracted);

        // Truncate large tool results
        const truncatedContent = truncateToolResult(content, 3000);

        // Create new ToolMessage with truncated content
        const truncatedMsg = new ToolMessage({
          content: truncatedContent,
          tool_call_id: msg.tool_call_id,
          name: msg.name,
        });
        truncatedMessages.push(truncatedMsg);
      } else {
        truncatedMessages.push(msg);
      }
    }

    // Update reasoning based on tool used
    let reasoning = state.reasoning;
    if (pendingAction?.tool) {
      const toolName = pendingAction.tool;
      if (toolName === 'list_job_paths') {
        reasoning = 'Ho elencato i path disponibili nel job. Ora ispezionerò i dati specifici...';
      } else if (toolName === 'inspect_job_data') {
        const path = (pendingAction.args as { path?: string })?.path || '';
        reasoning = `Ho letto i dati dal path "${path}". Continuo l'analisi...`;
      } else if (toolName === 'extract_label_data') {
        reasoning = "Ho estratto i dati dall'etichetta del prodotto.";
      } else if (toolName === 'tavily_search') {
        reasoning = 'Ho cercato informazioni aggiuntive sul web.';
      } else if (toolName === 'bdf_search_product_doses') {
        reasoning = 'Ho cercato le dosi ufficiali nella Banca Dati Fitofarmaci.';
      } else if (toolName === 'bdf_search_products_by_adversity') {
        reasoning = 'Ho cercato i prodotti autorizzati nella Banca Dati Fitofarmaci.';
      }
    }

    return {
      messages: truncatedMessages,
      sources: newSources,
      pendingAction: undefined,
      reasoning,
    };
  };
  return toolNodeWithSources;
}
