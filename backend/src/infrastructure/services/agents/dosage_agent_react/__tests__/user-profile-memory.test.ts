const mockSaveCoreMemory = jest.fn();

jest.mock('../memory/agent-memory.service', () => ({
  AgentMemoryService: jest.fn().mockImplementation(() => ({
    saveCoreMemory: (...args: unknown[]) => mockSaveCoreMemory(...args),
  })),
}));

import { persistUserProfileFacts } from '../memory/user-profile-memory';

describe('persistUserProfileFacts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveCoreMemory.mockResolvedValue(undefined);
  });

  it('persists professional context as core memory', async () => {
    await persistUserProfileFacts('user-1', 'Mi occupo di marketing');

    expect(mockSaveCoreMemory).toHaveBeenCalledWith('user-1', 'professional_context', {
      value: 'marketing',
      source: 'chat_message',
    });
  });

  it('skips messages without stable profile facts', async () => {
    await persistUserProfileFacts('user-1', 'Perche ripeti la domanda?');

    expect(mockSaveCoreMemory).not.toHaveBeenCalled();
  });
});
