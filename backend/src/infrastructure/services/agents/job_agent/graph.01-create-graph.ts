import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { createTavilySearchTool, createLabelExtractionTool, createDisciplinariSearchTool, createVectorSearchTool, createJobDetailsTool, createProposeJobModificationTool } from './tools';
import { createCachedBdfClient, createBdfSearchProductDosesTool, createBdfSearchProductsByAdversityTool } from '../../integrations/bdf';
import { AIMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { MAX_AGENT_ITERATIONS, StateAnnotation } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';
import { createOptimizeRequestNode } from './graph-node-optimize-request';
import { createPlanTasksNode } from './graph-node-plan-tasks';
import { createJobVerificationAgentNode } from './graph-node-agent';
import { createToolNodeWithSources } from './graph-node-tools';
import { createGenerateAnswerNode } from './graph-node-generate-answer';

export function jobVerificationGraphFactoryCreateGraph(this: JobVerificationGraphFactoryContext) {
    // Tools will be created dynamically with job context in the agent node
    const staticTools: StructuredTool[] = [];

    if (this.tavilyApiKey) {
      staticTools.push(createTavilySearchTool(this.tavilyApiKey));
    }

    staticTools.push(createLabelExtractionTool(this.userId));
    staticTools.push(createDisciplinariSearchTool());
    staticTools.push(createVectorSearchTool());

    // BDF official database tools (if credentials available)
    const bdfBaseUrl = process.env.URL_SERVER_BDF;
    const bdfUsername = process.env.USERNAME_BDF;
    const bdfPassword = process.env.PASSWORD_BDF;
    if (bdfBaseUrl && bdfUsername && bdfPassword) {
      const bdfClient = createCachedBdfClient();
      staticTools.push(
        createBdfSearchProductDosesTool(bdfClient),
        createBdfSearchProductsByAdversityTool(bdfClient),
      );
    }

    staticTools.push(createProposeJobModificationTool());

    if (this.userId) {
      staticTools.push(createJobDetailsTool(this.userId));
    }
    const optimizeRequestNode = createOptimizeRequestNode.call(this);
    const planTasksNode = createPlanTasksNode.call(this);
    const agentNode = createJobVerificationAgentNode.call(this, staticTools);
    const toolNodeWithSources = createToolNodeWithSources.call(this, staticTools);
    const generateAnswerNode = createGenerateAnswerNode.call(this);

    // 3. Build Graph
    const workflow = new StateGraph(StateAnnotation)
      .addNode('optimize_request', optimizeRequestNode)
      .addNode('plan_tasks', planTasksNode)
      .addNode('agent', agentNode)
      .addNode('tools', toolNodeWithSources)
      .addNode('generate_answer', generateAnswerNode)
      .addEdge(START, 'optimize_request')
      .addEdge('optimize_request', 'plan_tasks')
      .addEdge('plan_tasks', 'agent');

    // 4. Define Conditional Edges
    workflow.addConditionalEdges(
      'agent',
      (state: typeof StateAnnotation.State) => {
        const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
          tool_calls?: Array<{
            name: string;
            args: Record<string, unknown>;
            id: string;
          }>;
        };

        // If requires human input for modification, interrupt
        if (state.requiresHumanInput) {
          return END;
        }

        // Force completion if we've exceeded max iterations
        if (state.iterationCount >= MAX_AGENT_ITERATIONS) {
          console.log(
            `[AGENT] Max iterations (${MAX_AGENT_ITERATIONS}) reached, forcing completion`,
          );
          return 'generate_answer';
        }

        // If the agent wants to use a tool, go to tools
        if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
          return 'tools';
        }

        // If there are more tasks, continue with agent
        if (state.currentTaskId) {
          return 'agent';
        }

        // Otherwise generate final answer
        return 'generate_answer';
      },
      {
        tools: 'tools',
        agent: 'agent',
        generate_answer: 'generate_answer',
        [END]: END,
      },
    );

    // After tools execute, return to agent for processing results
    workflow.addEdge('tools', 'agent');

    // After generating answer, end
    workflow.addEdge('generate_answer', END);

    // 5. Compile with Checkpointer
    // NOTE: Human-in-the-loop for modifications is already handled via
    // requiresHumanInput state flag and conditional edge to END
    const checkpointer = new MemorySaver();

    return workflow.compile({
      checkpointer,
    });
  }
