import { createInspectJobDataTool, createListJobPathsTool } from './tools';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, MAX_AGENT_ITERATIONS, StateAnnotation } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';

export function createJobVerificationAgentNode(
  this: JobVerificationGraphFactoryContext,
  staticTools: StructuredTool[]
) {

  /**
   * Agent reasoning node.
   * Processes the current task and decides whether to use tools or respond directly.
   * Creates dynamic tools with job context for inspection.
   */
  const agentNode = async (
    state: typeof StateAnnotation.State,
  ): Promise<Partial<typeof StateAnnotation.State>> => {
    const { messages, tasks, currentTaskId, jobs, iterationCount } = state;

    // Increment iteration counter
    const newIterationCount = iterationCount + 1;
    console.log(`[AGENT] Iteration ${newIterationCount}/${MAX_AGENT_ITERATIONS}`);

    // Create dynamic tools with job context
    const dynamicTools: StructuredTool[] = [
      ...staticTools,
      createInspectJobDataTool(jobs as unknown as { job: Record<string, unknown> }[]),
      createListJobPathsTool(jobs as unknown as { job: Record<string, unknown> }[]),
    ];

    const modelWithTools = this.model.bindTools(dynamicTools);

    const currentTask = tasks.find((t) => t.id === currentTaskId);
    const taskContext = currentTask ? `\n\nTASK CORRENTE: ${currentTask.description}` : '';

    // Update current task to in_progress
    let updatedTasks = tasks;
    if (currentTask && currentTask.status === 'pending') {
      updatedTasks = tasks.map((t) =>
        t.id === currentTaskId ? { ...t, status: 'in_progress' as const } : t,
      );
    }

    const agentPrompt = new HumanMessage(
      `${taskContext}\n\nEsegui il task. Usa i tool se necessario, poi rispondi.`,
    );

    const agentUsageAccumulator = new UsageAccumulator();
    const agentUsageCollector = new LangChainUsageCollector(agentUsageAccumulator);
    const response = await modelWithTools.invoke([...messages, agentPrompt], {
      callbacks: [agentUsageCollector],
    });

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(agentUsageAccumulator, {
        userId: this.userId,
        jobType: LlmJobType.JOB_VERIFICATION,
        model: this.modelName,
        metadata: { step: 'job-verification-agent', iteration: newIterationCount },
      })
      .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

    const aiMessage = response as AIMessage & {
      tool_calls?: Array<{
        name: string;
        args: Record<string, unknown>;
        id: string;
      }>;
    };

    // If the agent wants to use tools, store pending action for streaming visibility
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const toolCall = aiMessage.tool_calls[0];

      // Check if it's a modification proposal
      const isModification = toolCall.name === 'propose_job_modification';

      // For inspection tools, don't require human input
      const isInspectionTool = ['inspect_job_data', 'list_job_paths'].includes(toolCall.name);

      return {
        messages: [response],
        tasks: updatedTasks,
        pendingAction: {
          type: isModification ? 'job_modification' : 'tool_call',
          tool: toolCall.name,
          args: toolCall.args,
          description: isModification
            ? `Modifica proposta: ${JSON.stringify(toolCall.args)}`
            : isInspectionTool
              ? `Ispeziono dati: ${toolCall.name}(${JSON.stringify(toolCall.args)})`
              : `Esecuzione tool ${toolCall.name}`,
        },
        requiresHumanInput: isModification,
        reasoning: isInspectionTool
          ? `Sto esplorando i dati del job per trovare le informazioni richieste...`
          : undefined,
        iterationCount: newIterationCount,
      };
    }

    // Update task status to completed
    const finalTasks = updatedTasks.map((t) =>
      t.id === currentTaskId ? { ...t, status: 'completed' as const } : t,
    );

    // Find next pending task
    const nextTask = finalTasks.find((t) => t.status === 'pending');

    return {
      messages: [response],
      tasks: finalTasks,
      currentTaskId: nextTask?.id,
      pendingAction: undefined,
      iterationCount: newIterationCount,
    };
  };
  return agentNode;
}
