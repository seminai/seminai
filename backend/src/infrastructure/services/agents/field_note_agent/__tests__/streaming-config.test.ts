import { AIMessage } from '@langchain/core/messages';
import { streamFieldNoteAgentChat } from '../streaming';
import { getFieldNoteAgentRegistry } from '../FieldNoteAgentRegistry';
import { FIELD_NOTE_RUNTIME_LIMITS } from '../runtime';

jest.mock('../FieldNoteAgentRegistry', () => ({
  getFieldNoteAgentRegistry: jest.fn(),
}));

describe('streamFieldNoteAgentChat config', () => {
  it('passes the configured recursion limit to LangGraph streaming', async () => {
    const streamConfigs: Array<Record<string, unknown>> = [];
    const streamInputs: Array<Record<string, unknown>> = [];
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages: [new AIMessage({ content: 'ok' })] },
      }),
      stream: jest.fn(async (_inputs, config) => {
        streamInputs.push(_inputs as Record<string, unknown>);
        streamConfigs.push(config as Record<string, unknown>);
        return {
          async *[Symbol.asyncIterator]() {
            // Empty stream: final state is read via getState().
          },
        };
      }),
    };
    const registry = {
      getOrCreateApp: jest.fn().mockResolvedValue({ app, chatId: 'chat-1' }),
      saveMessage: jest.fn(),
    };
    (getFieldNoteAgentRegistry as jest.Mock).mockReturnValue(registry);

    const events = [];
    for await (const event of streamFieldNoteAgentChat({
      threadId: 'thread-field-stream',
      userMessage: 'ciao',
      userId: 'user-1',
      prisma: {} as never,
    })) {
      events.push(event);
    }

    expect(streamConfigs).toHaveLength(1);
    expect(streamConfigs[0].recursionLimit).toBe(FIELD_NOTE_RUNTIME_LIMITS.RECURSION_LIMIT);
    expect(streamInputs[0].toolCallCount).toBe(0);
    expect(streamInputs[0].lastToolCalls).toEqual([]);
    expect(events.some((event) => event.type === 'complete')).toBe(true);
  });
});
