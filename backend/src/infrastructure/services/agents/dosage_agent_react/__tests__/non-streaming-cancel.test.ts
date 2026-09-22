import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { handleUserMessage } from '../DosageReactAgent';
import type { AgentApp } from '../DosageReactAgent';

/**
 * Smoke test for the non-streaming `handleUserMessage` path. It must inject
 * synthetic ToolMessage cancellations BEFORE submitting a new HumanMessage
 * when the thread is paused at approval_gate with pending tool_calls —
 * mirroring the streaming.ts cleanup so REST callers don't trip OpenAI's
 * `INVALID_TOOL_RESULTS` on the next turn.
 */
describe('handleUserMessage cancels stale pending tool calls', () => {
  function buildAppWithPendingApproval(): {
    app: AgentApp;
    capturedUpdates: Array<{
      update: Record<string, unknown>;
      asNode?: string;
    }>;
    streamInputs: unknown[];
  } {
    const aiWithPending = new AIMessage({ content: 'About to call tool' });
    (aiWithPending as AIMessage & { tool_calls: unknown[] }).tool_calls = [
      { name: 'create_company', id: 'tc-stale-1', args: { name: 'Acme' } },
    ];
    const messages: BaseMessage[] = [new HumanMessage("voglio creare un'azienda"), aiWithPending];

    const capturedUpdates: Array<{ update: Record<string, unknown>; asNode?: string }> = [];
    const streamInputs: unknown[] = [];

    const app = {
      getState: jest.fn().mockResolvedValue({ values: { messages } }),
      updateState: jest.fn().mockImplementation(async (_config, update, asNode) => {
        capturedUpdates.push({ update, asNode });
        // Simulate that the cancellation ToolMessages were appended.
        if ((update as { messages?: unknown[] }).messages) {
          for (const msg of (update as { messages: unknown[] }).messages) {
            messages.push(msg as ToolMessage);
          }
        }
      }),
      stream: jest.fn().mockImplementation(async (input) => {
        streamInputs.push(input);
        return {
          [Symbol.asyncIterator]() {
            return { next: async () => ({ done: true, value: undefined }) };
          },
        };
      }),
    } as unknown as AgentApp;

    return { app, capturedUpdates, streamInputs };
  }

  it('injects cancellation ToolMessages before streaming the new HumanMessage', async () => {
    const { app, capturedUpdates, streamInputs } = buildAppWithPendingApproval();

    await handleUserMessage(app, 'thread-non-stream', 'cambia idea, dimmi di più');

    const cancellationUpdate = capturedUpdates.find((call) =>
      Array.isArray((call.update as { messages?: unknown[] }).messages),
    );
    expect(cancellationUpdate).toBeDefined();
    expect(cancellationUpdate?.asNode).toBe('tools');
    const cancellationMessages = (cancellationUpdate?.update as { messages: ToolMessage[] })
      .messages;
    expect(cancellationMessages).toHaveLength(1);
    expect(cancellationMessages[0]).toBeInstanceOf(ToolMessage);
    expect(JSON.parse(cancellationMessages[0].content as string)).toEqual({
      cancelled: true,
      reason: 'Nuovo messaggio utente ricevuto durante attesa di approvazione.',
    });
    expect(streamInputs).toHaveLength(1);
    const newTurn = streamInputs[0] as { messages: HumanMessage[] };
    expect(newTurn.messages).toHaveLength(1);
    expect(newTurn.messages[0]).toBeInstanceOf(HumanMessage);
    expect((newTurn as unknown as { loopCounter: number }).loopCounter).toBe(0);
    expect((newTurn as unknown as { lastToolCalls: string[] }).lastToolCalls).toEqual([]);
  });

  it('does not inject cancellations when there is no pending tool call', async () => {
    const noPending = new AIMessage({ content: 'risposta finale' });
    const messages = [new HumanMessage('domanda'), noPending];
    const capturedUpdates: Array<{ update: Record<string, unknown> }> = [];
    const app = {
      getState: jest.fn().mockResolvedValue({ values: { messages } }),
      updateState: jest.fn().mockImplementation(async (_c, update) => {
        capturedUpdates.push({ update });
      }),
      stream: jest.fn().mockResolvedValue({
        [Symbol.asyncIterator]() {
          return { next: async () => ({ done: true, value: undefined }) };
        },
      }),
    } as unknown as AgentApp;

    await handleUserMessage(app, 'thread-clean', 'altro messaggio');

    const cancellationUpdate = capturedUpdates.find((call) =>
      Array.isArray((call.update as { messages?: unknown[] }).messages),
    );
    expect(cancellationUpdate).toBeUndefined();
  });
});
