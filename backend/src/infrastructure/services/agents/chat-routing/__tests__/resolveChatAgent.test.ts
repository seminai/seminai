import { WorkspaceKind } from '@prisma/client';

// Mock the dosage agent leaf modules so the real DosageChatAgent adapter loads
// without pulling the full agent graph / DB / LangChain into a unit test.
jest.mock('../../dosage_agent_react', () => ({
  createReactAgent: jest.fn(),
  getCachedAgentApp: jest.fn(),
  handleUserMessage: jest.fn(),
  approveAction: jest.fn(),
  rejectAction: jest.fn(),
  getAgentState: jest.fn(),
}));
jest.mock('../../dosage_agent_react/streaming', () => ({
  streamReactAgent: jest.fn(),
}));

import { resolveChatAgent } from '../resolveChatAgent';

describe('resolveChatAgent', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns the dosage agent for AGRICULTURAL workspaces', () => {
    const actualAgent = resolveChatAgent({ workspaceKind: WorkspaceKind.AGRICULTURAL });

    expect(actualAgent.kind).toBe('dosage');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns the dosage agent for a null kind (legacy / routing disabled) without warning', () => {
    const actualAgent = resolveChatAgent({ workspaceKind: null });

    expect(actualAgent.kind).toBe('dosage');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('routes MANUFACTURING to the manufacture agent without warning (Phase 4)', () => {
    const actualAgent = resolveChatAgent({ workspaceKind: WorkspaceKind.MANUFACTURING });

    expect(actualAgent.kind).toBe('manufacture');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
