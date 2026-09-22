import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import type { AgentTaskItem } from '../type/state';
import type { AgentTask } from '@prisma/client';

const TaskItemSchema = z.object({
  id: z.string().describe('Unique identifier for the task'),
  content: z.string().describe('Task description'),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).describe('Current status'),
  priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Task priority'),
});

function buildTaskRowId(chatId: string, taskId: string): string {
  return `${chatId}:${taskId}`;
}

function extractExternalTaskId(chatId: string, persistedId: string): string {
  const prefix = `${chatId}:`;
  return persistedId.startsWith(prefix) ? persistedId.slice(prefix.length) : persistedId;
}

/**
 * Tool: plan_task
 * Persistent task planner (TodoWrite-equivalent).
 * Upserts tasks to DB and returns a reminder with the next pending task.
 */
export function createPlanTaskTool(threadId: string, chatId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'plan_task',
    description: `Crea o aggiorna il piano di lavoro per la sessione corrente.
Ogni task ha un id, contenuto, stato (pending/in_progress/completed/cancelled) e priorità.
Usa questo strumento per pianificare il lavoro, aggiornare lo stato dei task completati e aggiungere nuovi task.
Il piano viene salvato in modo persistente e iniettato come reminder ad ogni turno.`,
    schema: z.object({
      todos: z.array(TaskItemSchema).min(1).describe('Lista completa dei task'),
    }),
    func: async ({ todos }) => {
      try {
        const taskItems: AgentTaskItem[] = [];

        for (let i = 0; i < todos.length; i++) {
          const todo = todos[i];
          const rowId = buildTaskRowId(chatId, todo.id);
          await prisma.agentTask.upsert({
            where: { id: rowId },
            create: {
              id: rowId,
              chatId,
              threadId,
              content: todo.content,
              status: todo.status,
              priority: todo.priority,
              sequence: i,
            },
            update: {
              content: todo.content,
              status: todo.status,
              priority: todo.priority,
              sequence: i,
            },
          });

          taskItems.push({
            id: todo.id,
            content: todo.content,
            status: todo.status as AgentTaskItem['status'],
            priority: todo.priority as AgentTaskItem['priority'],
            sequence: i,
          });
        }

        const nextPending = taskItems.find(
          (t) => t.status === 'pending' || t.status === 'in_progress',
        );
        const completedCount = taskItems.filter((t) => t.status === 'completed').length;

        const reminder = nextPending
          ? `Piano aggiornato. Segui il prossimo task: [${nextPending.id}] ${nextPending.content}`
          : `Piano aggiornato. Tutti i ${completedCount} task sono completati.`;

        return JSON.stringify({
          taskCount: taskItems.length,
          completedCount,
          pendingCount: taskItems.filter((t) => t.status === 'pending').length,
          inProgressCount: taskItems.filter((t) => t.status === 'in_progress').length,
          tasks: taskItems,
          reminder,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

/**
 * Loads persisted tasks for a threadId from the database.
 */
export async function loadTasksFromDb(threadId: string): Promise<AgentTaskItem[]> {
  const rows = await prisma.agentTask.findMany({
    where: { threadId },
    orderBy: { sequence: 'asc' },
  });

  return rows.map((r: AgentTask) => ({
    id: extractExternalTaskId(r.chatId, r.id),
    content: r.content,
    status: r.status as AgentTaskItem['status'],
    priority: r.priority as AgentTaskItem['priority'],
    sequence: r.sequence,
  }));
}

/**
 * Formats tasks into a system reminder string.
 */
export function formatTaskReminder(tasks: AgentTaskItem[]): string | null {
  const activeTasks = tasks.filter((t) => t.status !== 'cancelled');
  if (activeTasks.length === 0) return null;

  const allDone = activeTasks.every((t) => t.status === 'completed');
  if (allDone) return null;

  const lines = activeTasks.map((t) => {
    const icon = t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[>]' : '[ ]';
    return `${icon} ${t.id}: ${t.content} (${t.priority})`;
  });

  const next = activeTasks.find((t) => t.status === 'in_progress' || t.status === 'pending');

  return [
    '<system-reminder>',
    'Piano di lavoro corrente:',
    ...lines,
    next ? `Prossimo task: ${next.content}` : '',
    'Aggiorna il piano con plan_task quando completi o aggiungi task.',
    '</system-reminder>',
  ]
    .filter(Boolean)
    .join('\n');
}
