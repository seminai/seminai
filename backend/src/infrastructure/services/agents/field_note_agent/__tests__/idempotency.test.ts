/**
 * Unit tests for approveAndExecute / rejectAndRespond idempotency (PR-E of P2).
 * Mocks the LangGraph app so we can assert that a missing pendingAction
 * yields a COMPLETED no-op and that the sentinel is cleared after a
 * successful execution.
 */
import { approveAndExecute, rejectAndRespond } from '../field-note-operations';
import type { FieldNoteAgentApp } from '../ChatFieldNoteAgent';
import { AIMessage } from '@langchain/core/messages';

function buildAppMock(initialState: Record<string, unknown>): FieldNoteAgentApp {
  let state = initialState;
  return {
    getState: jest.fn(async () => ({ values: state, next: [] as string[] })),
    updateState: jest.fn(async (_config: unknown, patch: Record<string, unknown>) => {
      state = { ...state, ...patch };
    }),
    stream: jest.fn(async function* mockStream() {
      yield {};
    }),
  } as unknown as FieldNoteAgentApp;
}

describe('approveAndExecute — idempotency (PR-E)', () => {
  it('returns COMPLETED no-op when pendingAction is undefined (replay safe)', async () => {
    const app = buildAppMock({ messages: [] });

    const response = await approveAndExecute(app, 'thread-1');

    expect(response.status).toBe('COMPLETED');
    expect(response.message).toMatch(/Operazione già completata|non più disponibile/);
    expect(app.updateState).not.toHaveBeenCalled();
    expect(app.stream).not.toHaveBeenCalled();
  });

  it('clears pendingAction after the graph reports finished (success path)', async () => {
    const finishedAi = new AIMessage('Salvataggio completato.');
    const app = buildAppMock({
      messages: [finishedAi],
      pendingAction: {
        tool: 'save_field_note',
        args: {},
        description: 'Esecuzione save_field_note',
        requiresApproval: true,
        riskLevel: 'medium',
      },
    });

    const response = await approveAndExecute(app, 'thread-1');

    expect(response.status).toBe('COMPLETED');
    expect(app.updateState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pendingAction: null }),
    );
  });
});

describe('rejectAndRespond — idempotency (PR-E)', () => {
  it('returns COMPLETED no-op when pendingAction is undefined', async () => {
    const app = buildAppMock({ messages: [] });

    const response = await rejectAndRespond(app, 'thread-1', 'campo sbagliato');

    expect(response.status).toBe('COMPLETED');
    expect(response.message).toMatch(/Operazione già completata|non più disponibile/);
    expect(app.updateState).not.toHaveBeenCalled();
    expect(app.stream).not.toHaveBeenCalled();
  });
});
