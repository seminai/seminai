import {
  createTestUser,
  createTestChat,
  deleteTestChat,
  deleteAllAgentTasks,
  prisma,
  type ITestUser,
  type ITestChat,
} from './helpers';
import {
  createPlanTaskTool,
  loadTasksFromDb,
  formatTaskReminder,
} from '../infrastructure/services/agents/dosage_agent_react/tools/task-planner.tool';

// Mock durable-execution to bypass LangGraph task() wrapper which requires a graph context.
jest.mock('../infrastructure/services/agents/dosage_agent_react/graph/durable-execution', () => ({
  ...jest.requireActual(
    '../infrastructure/services/agents/dosage_agent_react/graph/durable-execution',
  ),
  createDurableTask: <InputT, OutputT>(_name: string, fn: (input: InputT) => Promise<OutputT>) =>
    fn,
}));

import { createTaskPlannerNode } from '../infrastructure/services/agents/dosage_agent_react/graph/task-planner-node';
import { HumanMessage } from '@langchain/core/messages';
import type { AgentTaskItem } from '../infrastructure/services/agents/dosage_agent_react/type/state';

let testUser: ITestUser;
let testChat: ITestChat;
let secondChat: ITestChat;

beforeAll(async () => {
  testUser = await createTestUser();
  testChat = await createTestChat({ userId: testUser.id });
  secondChat = await createTestChat({ userId: testUser.id });
});

afterEach(async () => {
  await deleteAllAgentTasks(testChat.threadId);
  await deleteAllAgentTasks(secondChat.threadId);
});

afterAll(async () => {
  await deleteTestChat(testChat.id);
  await deleteTestChat(secondChat.id);
});

describe('AgentTask integration', () => {
  it('CRUD AgentTask: create via prisma, read by threadId, update status, delete', async () => {
    const created = await prisma.agentTask.create({
      data: {
        chatId: testChat.id,
        threadId: testChat.threadId,
        content: 'Expand cycles',
        sequence: 0,
        status: 'pending',
        priority: 'high',
      },
    });
    expect(created.id).toBeDefined();
    expect(created.content).toBe('Expand cycles');
    expect(created.status).toBe('pending');
    const byThread = await prisma.agentTask.findMany({
      where: { threadId: testChat.threadId },
      orderBy: { sequence: 'asc' },
    });
    expect(byThread.length).toBe(1);
    expect(byThread[0].id).toBe(created.id);
    const updated = await prisma.agentTask.update({
      where: { id: created.id },
      data: { status: 'completed' },
    });
    expect(updated.status).toBe('completed');
    await prisma.agentTask.delete({ where: { id: created.id } });
    const afterDelete = await prisma.agentTask.findMany({
      where: { threadId: testChat.threadId },
    });
    expect(afterDelete.length).toBe(0);
  });

  it('plan_task tool creates tasks in DB', async () => {
    const tool = createPlanTaskTool(testChat.threadId, testChat.id);
    const todos = [
      {
        id: 'task-1',
        content: 'Expand cycles',
        status: 'pending' as const,
        priority: 'high' as const,
      },
    ];
    const result = await tool.invoke({ todos });
    const parsed = JSON.parse(result as string);
    expect(parsed.taskCount).toBe(1);
    expect(parsed.tasks[0].content).toBe('Expand cycles');
    const dbTasks = await prisma.agentTask.findMany({
      where: { threadId: testChat.threadId },
    });
    expect(dbTasks.length).toBe(1);
    expect(dbTasks[0].content).toBe('Expand cycles');
  });

  it('plan_task tool result contains reminder prefix', async () => {
    const tool = createPlanTaskTool(testChat.threadId, testChat.id);
    const todos = [
      {
        id: 'task-r1',
        content: 'First task',
        status: 'pending' as const,
        priority: 'high' as const,
      },
    ];
    const result = await tool.invoke({ todos });
    const parsed = JSON.parse(result as string);
    expect(parsed.reminder).toContain('Piano aggiornato. Segui il prossimo task:');
  });

  it('plan_task: second call updates status to completed', async () => {
    const tool = createPlanTaskTool(testChat.threadId, testChat.id);
    await tool.invoke({
      todos: [
        { id: 'task-u1', content: 'Task to complete', status: 'pending', priority: 'medium' },
      ],
    });
    await tool.invoke({
      todos: [
        { id: 'task-u1', content: 'Task to complete', status: 'completed', priority: 'medium' },
      ],
    });
    const dbTasks = await prisma.agentTask.findMany({
      where: { threadId: testChat.threadId },
    });
    expect(dbTasks.length).toBe(1);
    expect(dbTasks[0].status).toBe('completed');
  });

  it('plan_task isolates tasks across chats even with the same todo id', async () => {
    const firstTool = createPlanTaskTool(testChat.threadId, testChat.id);
    const secondTool = createPlanTaskTool(secondChat.threadId, secondChat.id);

    await firstTool.invoke({
      todos: [{ id: 'shared-id', content: 'Task chat A', status: 'pending', priority: 'medium' }],
    });
    await secondTool.invoke({
      todos: [{ id: 'shared-id', content: 'Task chat B', status: 'completed', priority: 'high' }],
    });

    const firstTasks = await loadTasksFromDb(testChat.threadId);
    const secondTasks = await loadTasksFromDb(secondChat.threadId);

    expect(firstTasks).toHaveLength(1);
    expect(secondTasks).toHaveLength(1);
    expect(firstTasks[0].id).toBe('shared-id');
    expect(secondTasks[0].id).toBe('shared-id');
    expect(firstTasks[0].content).toBe('Task chat A');
    expect(secondTasks[0].content).toBe('Task chat B');
  });

  it('loadTasksFromDb: returns tasks sorted by sequence', async () => {
    await prisma.agentTask.createMany({
      data: [
        {
          chatId: testChat.id,
          threadId: testChat.threadId,
          content: 'Third',
          sequence: 2,
          status: 'pending',
          priority: 'low',
        },
        {
          chatId: testChat.id,
          threadId: testChat.threadId,
          content: 'First',
          sequence: 0,
          status: 'pending',
          priority: 'high',
        },
        {
          chatId: testChat.id,
          threadId: testChat.threadId,
          content: 'Second',
          sequence: 1,
          status: 'pending',
          priority: 'medium',
        },
      ],
    });
    const loaded = await loadTasksFromDb(testChat.threadId);
    expect(loaded.length).toBe(3);
    expect(loaded[0].content).toBe('First');
    expect(loaded[1].content).toBe('Second');
    expect(loaded[2].content).toBe('Third');
  });

  it('formatTaskReminder: contains system-reminder tags and task content', () => {
    const items: AgentTaskItem[] = [
      { id: 't1', content: 'Do thing A', status: 'pending', priority: 'high', sequence: 0 },
      { id: 't2', content: 'Do thing B', status: 'completed', priority: 'medium', sequence: 1 },
    ];
    const formatted = formatTaskReminder(items);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain('<system-reminder>');
    expect(formatted).toContain('</system-reminder>');
    expect(formatted).toContain('Do thing A');
  });

  it('formatTaskReminder with all completed returns null', () => {
    const items: AgentTaskItem[] = [
      { id: 'c1', content: 'Done A', status: 'completed', priority: 'high', sequence: 0 },
      { id: 'c2', content: 'Done B', status: 'completed', priority: 'medium', sequence: 1 },
    ];
    const formatted = formatTaskReminder(items);
    expect(formatted).toBeNull();
  });

  it('taskPlannerNode with existing tasks returns SystemMessage with reminder', async () => {
    await prisma.agentTask.createMany({
      data: [
        {
          chatId: testChat.id,
          threadId: testChat.threadId,
          content: 'Pending task',
          sequence: 0,
          status: 'pending',
          priority: 'high',
        },
      ],
    });
    const node = createTaskPlannerNode(testChat.threadId);
    const state = {
      messages: [new HumanMessage('test')],
      loopCounter: 0,
      lastToolCalls: [] as string[],
      taskList: [] as AgentTaskItem[],
    };
    const result = await node(state);
    expect(result.taskList).toHaveLength(1);
    expect(result.taskList![0].content).toBe('Pending task');
    expect(result.messages).toHaveLength(1);
    expect(result.messages![0]._getType()).toBe('system');
    const content = (result.messages![0] as { content: string }).content;
    expect(content).toContain('<system-reminder>');
    expect(content).toContain('Pending task');
  });

  it('taskPlannerNode with no tasks returns taskList []', async () => {
    const node = createTaskPlannerNode(testChat.threadId);
    const state = {
      messages: [new HumanMessage('test')],
      loopCounter: 0,
      lastToolCalls: [] as string[],
      taskList: [] as AgentTaskItem[],
    };
    const result = await node(state);
    expect(result.taskList).toEqual([]);
    expect(result.messages).toBeUndefined();
  });
});
