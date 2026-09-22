import { AIMessage } from '@langchain/core/messages';
import { handleUserMessage } from '../ChatFieldNoteAgent';
import { FIELD_NOTE_RUNTIME_LIMITS } from '../runtime';
import type { FieldNoteAgentApp } from '../ChatFieldNoteAgent';

describe('handleUserMessage field note config', () => {
  it('passes the configured recursion limit to LangGraph streaming', async () => {
    const streamConfigs: Array<Record<string, unknown>> = [];
    const streamInputs: Array<Record<string, unknown>> = [];
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages: [new AIMessage({ content: 'ok' })] },
      }),
      updateState: jest.fn(),
      stream: jest.fn(async (_inputs, config) => {
        streamInputs.push(_inputs as Record<string, unknown>);
        streamConfigs.push(config as Record<string, unknown>);
        return {
          async *[Symbol.asyncIterator]() {
            // Empty stream: final state is read via getState().
          },
        };
      }),
    } as unknown as FieldNoteAgentApp;

    const response = await handleUserMessage(app, 'thread-field-chat', 'ciao');

    expect(streamConfigs).toHaveLength(1);
    expect(streamConfigs[0].recursionLimit).toBe(FIELD_NOTE_RUNTIME_LIMITS.RECURSION_LIMIT);
    expect(streamInputs[0].toolCallCount).toBe(0);
    expect(streamInputs[0].lastToolCalls).toEqual([]);
    expect(response.status).toBe('COMPLETED');
  });
});
