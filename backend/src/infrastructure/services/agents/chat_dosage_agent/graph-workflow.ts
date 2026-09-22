import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { AgentState } from './types';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { DESTRUCTIVE_TOOLS } from './graph.support';
import type { AgentGraphFactoryContext } from './graph.context';
import { buildChatDosageGraphTools } from './graph-tool-setup';

interface ChatDosageWorkflowInput {
  readonly tools: ReturnType<typeof buildChatDosageGraphTools>['tools'];
  readonly agentNode: (state: AgentState) => Promise<Partial<AgentState>>;
}

export function compileChatDosageWorkflow(
  this: AgentGraphFactoryContext,
  input: ChatDosageWorkflowInput,
) {
  const { tools, agentNode } = input;
  /**
   * Tool execution node.
   * Executes the tools requested by the agent.
   */
  const toolNode = new ToolNode(tools);

  /**
   * Approval gate node (passthrough).
   * The graph interrupts BEFORE this node when requireApproval=true,
   * giving the user a chance to approve or reject the destructive operation.
   */
  const approvalGateNode = async (_state: AgentState): Promise<Partial<AgentState>> => ({});

  // 3. Build Graph with State Channels
  const workflow = new StateGraph<AgentState>({
    channels: {
      messages: {
        reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => [],
      },
      currentTask: {
        reducer: (x, y) => y ?? x,
        default: () => undefined,
      },
      pendingAction: {
        reducer: (x, y) => y ?? x,
        default: () => undefined,
      },
    },
  })
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('approval_gate', approvalGateNode)
    .addEdge(START, 'agent');

  // 4. Define Conditional Edges
  workflow.addConditionalEdges(
    'agent',
    (state: AgentState) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
        tool_calls?: Array<{
          name: string;
          args: Record<string, unknown>;
          id: string;
        }>;
      };
      if (!lastMessage?.tool_calls || lastMessage.tool_calls.length === 0) {
        return END;
      }
      const hasDestructive = lastMessage.tool_calls.some((tc) => DESTRUCTIVE_TOOLS.has(tc.name));
      if (hasDestructive) {
        return 'approval_gate';
      }
      return 'tools';
    },
    {
      tools: 'tools',
      approval_gate: 'approval_gate',
      [END]: END,
    },
  );

  // Approval gate passes through to tool execution after user approval
  workflow.addEdge('approval_gate', 'tools');

  // After tools execute, return to agent for processing results
  workflow.addEdge('tools', 'agent');

  // 5. Compile with Checkpointer and optional Interrupts
  const checkpointer = new MemorySaver();

  return workflow.compile({
    checkpointer,
    // When requireApproval=true (default), only destructive tools pause for approval.
    // Read-only tools always execute automatically.
    ...(this.requireApproval ? { interruptBefore: ['approval_gate'] } : {}),
  });
}
