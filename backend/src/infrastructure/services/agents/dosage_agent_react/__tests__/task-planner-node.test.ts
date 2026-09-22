/**
 * Tests for task-planner logic.
 * Since createTaskPlannerNode depends on createDurableTask and loadTasksFromDb (Prisma),
 * which cannot be mocked without jest.mock, we test the pure function formatTaskReminder
 * directly (it handles all the formatting logic the node uses).
 */
import { formatTaskReminder } from '../tools/task-planner.tool';
import type { AgentTaskItem } from '../type/state';

describe('formatTaskReminder', () => {
  it('returns null for empty tasks', () => {
    expect(formatTaskReminder([])).toBeNull();
  });

  it('returns null when all tasks are cancelled', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Cancelled', status: 'cancelled', priority: 'low', sequence: 1 },
    ];
    expect(formatTaskReminder(tasks)).toBeNull();
  });

  it('returns null when all active tasks are completed', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Done', status: 'completed', priority: 'high', sequence: 1 },
      { id: 't2', content: 'Also done', status: 'completed', priority: 'medium', sequence: 2 },
    ];
    expect(formatTaskReminder(tasks)).toBeNull();
  });

  it('formats pending and completed tasks with correct icons', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Calculate dosage', status: 'completed', priority: 'high', sequence: 1 },
      {
        id: 't2',
        content: 'Validate compliance',
        status: 'in_progress',
        priority: 'high',
        sequence: 2,
      },
      { id: 't3', content: 'Generate plan', status: 'pending', priority: 'medium', sequence: 3 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('[x] t1: Calculate dosage (high)');
    expect(result).toContain('[>] t2: Validate compliance (high)');
    expect(result).toContain('[ ] t3: Generate plan (medium)');
  });

  it('includes next task hint for in_progress task', () => {
    const tasks: AgentTaskItem[] = [
      {
        id: 't1',
        content: 'Validate compliance',
        status: 'in_progress',
        priority: 'high',
        sequence: 1,
      },
      { id: 't2', content: 'Plan', status: 'pending', priority: 'medium', sequence: 2 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('Prossimo task: Validate compliance');
  });

  it('includes next task hint for first pending when no in_progress', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Done', status: 'completed', priority: 'high', sequence: 1 },
      { id: 't2', content: 'Next up', status: 'pending', priority: 'medium', sequence: 2 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('Prossimo task: Next up');
  });

  it('wraps output in system-reminder tags', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Work', status: 'pending', priority: 'high', sequence: 1 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('<system-reminder>');
    expect(result).toContain('</system-reminder>');
    expect(result).toContain('Piano di lavoro corrente:');
  });

  it('excludes cancelled tasks from output', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Active', status: 'pending', priority: 'high', sequence: 1 },
      { id: 't2', content: 'Cancelled', status: 'cancelled', priority: 'low', sequence: 2 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('Active');
    expect(result).not.toContain('Cancelled');
  });

  it('includes plan_task update instruction', () => {
    const tasks: AgentTaskItem[] = [
      { id: 't1', content: 'Work', status: 'pending', priority: 'high', sequence: 1 },
    ];
    const result = formatTaskReminder(tasks)!;
    expect(result).toContain('plan_task');
  });
});
