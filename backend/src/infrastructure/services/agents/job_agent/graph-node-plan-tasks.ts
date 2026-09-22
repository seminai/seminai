import { HumanMessage } from '@langchain/core/messages';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, parseTaskPlanFromContent, StateAnnotation } from './graph.support';
import type { JobVerificationGraphFactoryContext } from './graph.context';

export function createPlanTasksNode(
  this: JobVerificationGraphFactoryContext
) {

  /**
   * Task planner node.
   * Creates a list of tasks to solve the problem.
   */
  const planTasksNode = async (
    state: typeof StateAnnotation.State,
  ): Promise<Partial<typeof StateAnnotation.State>> => {
    const { messages } = state;

    const plannerPrompt = new HumanMessage(
      `Basandoti sulla conversazione, crea un piano di azione.
Rispondi con un JSON array di task, ogni task con: {"id": "task_N", "description": "cosa fare"}
Se la richiesta è semplice, puoi avere anche un solo task.
Rispondi SOLO con il JSON array.`,
    );

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const response = await this.model.invoke([...messages, plannerPrompt], {
      callbacks: [usageCollector],
    });

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        userId: this.userId,
        jobType: LlmJobType.JOB_VERIFICATION,
        model: this.modelName,
        metadata: { step: 'job-verification-plan-tasks' },
      })
      .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

    const content = response.content.toString();
    const tasks = parseTaskPlanFromContent(content);

    return {
      tasks,
      currentTaskId: tasks.length > 0 ? tasks[0].id : undefined,
    };
  };
  return planTasksNode;
}
