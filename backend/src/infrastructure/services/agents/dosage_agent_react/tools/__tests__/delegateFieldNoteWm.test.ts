/**
 * Unit tests for the registry-only field note agent lookup (PR-D of P2).
 * Verifies that:
 *   1. delegate_to_field_note writes only the serializable link fields
 *      (fieldNoteThreadId + fieldNoteChatId) to working memory, never the
 *      non-serializable Runnable app.
 *   2. approve_field_note works after TTL eviction simulated by WM holding
 *      only fieldNoteThreadId (no cached app field at all).
 *   3. reject_field_note works in the same post-eviction state.
 */
import {
  createDelegateToFieldNoteTool,
  createApproveFieldNoteTool,
  createRejectFieldNoteTool,
} from '../delegate-field-note.tool';
import { getFieldNoteAgentRegistry } from '../../../field_note_agent/FieldNoteAgentRegistry';
import {
  handleUserMessage,
  approveAndExecute,
  rejectAndRespond,
} from '../../../field_note_agent/ChatFieldNoteAgent';
import { getWorkingMemory, updateWorkingMemory } from '../../working-memory';

const mockApp = { __mock: 'fieldNoteAgentApp' } as never;
const mockGetOrCreateApp = jest.fn();
const mockSaveMessage = jest.fn();

jest.mock('../../../field_note_agent/FieldNoteAgentRegistry', () => ({
  getFieldNoteAgentRegistry: jest.fn(),
}));

jest.mock('../../../field_note_agent/ChatFieldNoteAgent', () => ({
  handleUserMessage: jest.fn(),
  approveAndExecute: jest.fn(),
  rejectAndRespond: jest.fn(),
}));

jest.mock('../../working-memory', () => ({
  getWorkingMemory: jest.fn(),
  updateWorkingMemory: jest.fn(),
}));

jest.mock('../../../../../repositories/Prisma', () => ({
  prisma: {},
}));

jest.mock('../field-note-summary', () => ({
  buildHumanReadableSummary: jest.fn().mockResolvedValue(''),
}));

const mockedRegistry = getFieldNoteAgentRegistry as jest.MockedFunction<
  typeof getFieldNoteAgentRegistry
>;
const mockedHandleUserMessage = handleUserMessage as jest.MockedFunction<typeof handleUserMessage>;
const mockedApproveAndExecute = approveAndExecute as jest.MockedFunction<typeof approveAndExecute>;
const mockedRejectAndRespond = rejectAndRespond as jest.MockedFunction<typeof rejectAndRespond>;
const mockedGetWorkingMemory = getWorkingMemory as jest.MockedFunction<typeof getWorkingMemory>;
const mockedUpdateWorkingMemory = updateWorkingMemory as jest.MockedFunction<
  typeof updateWorkingMemory
>;

describe('delegate-field-note tools — registry-only app lookup (PR-D)', () => {
  beforeEach(() => {
    mockGetOrCreateApp.mockReset().mockResolvedValue({
      app: mockApp,
      chatId: 'chat-123',
      isNew: false,
    });
    mockSaveMessage.mockReset().mockResolvedValue(undefined);
    mockedRegistry.mockReturnValue({
      getOrCreateApp: mockGetOrCreateApp,
      saveMessage: mockSaveMessage,
    } as never);
    mockedHandleUserMessage.mockReset();
    mockedApproveAndExecute.mockReset();
    mockedRejectAndRespond.mockReset();
    mockedGetWorkingMemory.mockReset();
    mockedUpdateWorkingMemory.mockReset();
  });

  it('delegate_to_field_note: writes only fieldNoteThreadId and fieldNoteChatId to WM (no fieldNoteAgentApp)', async () => {
    mockedGetWorkingMemory.mockReturnValue({});
    mockedHandleUserMessage.mockResolvedValueOnce({
      status: 'COMPLETED',
      message: 'classification done',
    });

    const tool = createDelegateToFieldNoteTool('parent-thread', 'user-1');
    await tool.func({ message: 'ho trattato il vigneto' });

    // The WM update payload must contain ONLY the serializable keys.
    const updateCall = mockedUpdateWorkingMemory.mock.calls.find(
      ([tid]) => tid === 'parent-thread',
    );
    expect(updateCall).toBeDefined();
    const payload = updateCall![1];
    expect(payload).toEqual({
      fieldNoteThreadId: 'parent-thread-fieldnote',
      fieldNoteChatId: 'chat-123',
    });
    expect(payload).not.toHaveProperty('fieldNoteAgentApp');
  });

  it('approve_field_note: succeeds when WM holds only fieldNoteThreadId (post-eviction state)', async () => {
    // Simulate the state after TTL eviction + DB hydration: fieldNoteThreadId
    // survived (serializable), but the Runnable app was never persisted.
    mockedGetWorkingMemory.mockReturnValue({
      fieldNoteThreadId: 'parent-thread-fieldnote',
      fieldNoteChatId: 'chat-123',
    });
    mockedApproveAndExecute.mockResolvedValueOnce({
      status: 'COMPLETED',
      message: 'saved',
      createdFieldNoteIds: ['field-note-1'],
    });

    const tool = createApproveFieldNoteTool('parent-thread', 'user-1');
    const raw = await tool.func({});
    const out = JSON.parse(raw as string);

    expect(out.status).toBe('COMPLETED');
    expect(mockGetOrCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'parent-thread-fieldnote', userId: 'user-1' }),
    );
    expect(mockedApproveAndExecute).toHaveBeenCalledWith(
      mockApp,
      'parent-thread-fieldnote',
      expect.anything(),
      'user-1',
    );
    // After success, only the serializable link is cleared (no fieldNoteAgentApp).
    const clearCall = mockedUpdateWorkingMemory.mock.calls.find(([, payload]) =>
      Object.prototype.hasOwnProperty.call(payload as object, 'fieldNoteThreadId'),
    );
    expect(clearCall?.[1]).toEqual({
      fieldNoteThreadId: undefined,
      fieldNoteChatId: undefined,
    });
  });

  it('approve_field_note: returns NO_OP when approval creates no rows', async () => {
    mockedGetWorkingMemory.mockReturnValue({
      fieldNoteThreadId: 'parent-thread-fieldnote',
      fieldNoteChatId: 'chat-123',
    });
    mockedApproveAndExecute.mockResolvedValueOnce({
      status: 'COMPLETED',
      message: 'nothing pending',
    });

    const tool = createApproveFieldNoteTool('parent-thread', 'user-1');
    const raw = await tool.func({});
    const out = JSON.parse(raw as string);

    expect(out.status).toBe('NO_OP');
    expect(out.hint).toContain('Non dire');
  });

  it('reject_field_note: succeeds when WM holds only fieldNoteThreadId (post-eviction state)', async () => {
    mockedGetWorkingMemory.mockReturnValue({
      fieldNoteThreadId: 'parent-thread-fieldnote',
      fieldNoteChatId: 'chat-123',
    });
    mockedRejectAndRespond.mockResolvedValueOnce({
      status: 'COMPLETED',
      message: 'rejected',
    });

    const tool = createRejectFieldNoteTool('parent-thread', 'user-1');
    const raw = await tool.func({ feedback: 'campo sbagliato' });
    const out = JSON.parse(raw as string);

    expect(out.status).toBe('COMPLETED');
    expect(mockGetOrCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'parent-thread-fieldnote', userId: 'user-1' }),
    );
    expect(mockedRejectAndRespond).toHaveBeenCalledWith(
      mockApp,
      'parent-thread-fieldnote',
      'campo sbagliato',
    );
  });
});
