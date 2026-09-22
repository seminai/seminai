import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { MessageRole } from '@prisma/client';

const mockFindUnique = jest.fn();
const mockLoadTasksFromDb = jest.fn();
const mockUpdateWorkingMemory = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    chat: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

jest.mock('../tools/task-planner.tool', () => ({
  loadTasksFromDb: (...args: unknown[]) => mockLoadTasksFromDb(...args),
}));

jest.mock('../working-memory', () => ({
  updateWorkingMemory: (...args: unknown[]) => mockUpdateWorkingMemory(...args),
}));

import { restoreThreadStateFromDatabase } from '../persistence/thread-state-recovery';

describe('restoreThreadStateFromDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadTasksFromDb.mockResolvedValue([]);
  });

  it('restores persisted history when the checkpointer state is stale', async () => {
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages: [new HumanMessage('old user'), new AIMessage('old assistant')] },
      }),
      updateState: jest.fn().mockResolvedValue({}),
    };
    mockFindUnique.mockResolvedValue({
      messages: [
        buildMessage(MessageRole.USER, 'old user'),
        buildMessage(MessageRole.ASSISTANT, 'old assistant'),
        buildMessage(MessageRole.USER, 'answered context'),
        buildMessage(MessageRole.ASSISTANT, 'acknowledged context'),
        buildMessage(MessageRole.USER, 'current user turn'),
      ],
    });

    const result = await restoreThreadStateFromDatabase(app, 'thread-1');

    expect(result).toBe(true);
    expect(app.updateState).toHaveBeenCalledTimes(1);
    const update = app.updateState.mock.calls[0][1] as { messages: readonly unknown[] };
    expect(update.messages).toHaveLength(4);
  });

  it('does not restore when the persisted state only adds the current user turn', async () => {
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages: [new HumanMessage('old user'), new AIMessage('old assistant')] },
      }),
      updateState: jest.fn().mockResolvedValue({}),
    };
    mockFindUnique.mockResolvedValue({
      messages: [
        buildMessage(MessageRole.USER, 'old user'),
        buildMessage(MessageRole.ASSISTANT, 'old assistant'),
        buildMessage(MessageRole.USER, 'current user turn'),
      ],
    });

    const result = await restoreThreadStateFromDatabase(app, 'thread-1');

    expect(result).toBe(false);
    expect(app.updateState).not.toHaveBeenCalled();
  });
});

function buildMessage(role: MessageRole, content: string) {
  return {
    role,
    content,
    pendingToolCalls: null,
    metadata: null,
  };
}
