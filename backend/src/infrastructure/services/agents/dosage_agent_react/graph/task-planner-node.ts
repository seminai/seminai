import { SystemMessage } from '@langchain/core/messages';
import { DosageReactState } from '../type/state';
import { loadTasksFromDb, formatTaskReminder } from '../tools/task-planner.tool';
import { createDurableTask } from './durable-execution';

/**
 * Task planner node.
 * Runs as the first node after START.
 * Loads persisted tasks from DB and injects a system reminder into messages.
 */
export function createTaskPlannerNode(threadId: string) {
  const loadTasksTask = createDurableTask(
    'dosage_react_load_tasks',
    async (currentThreadId: string) => loadTasksFromDb(currentThreadId),
  );
  return async (_state: DosageReactState): Promise<Partial<DosageReactState>> => {
    const tasks = await loadTasksTask(threadId);
    if (tasks.length === 0) {
      return { taskList: [] };
    }
    const reminder = formatTaskReminder(tasks);
    if (!reminder) {
      return { taskList: tasks };
    }

    return {
      taskList: tasks,
      messages: [new SystemMessage(reminder)],
    };
  };
}
