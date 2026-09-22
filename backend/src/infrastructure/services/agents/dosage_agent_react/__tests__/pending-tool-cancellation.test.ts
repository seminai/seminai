import { cancelPendingToolCalls } from '../graph/pending-tool-cancellation';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { HitlAgentApp } from '../../shared/hitl/types';

function createMockApp(messages: unknown[]): HitlAgentApp {
  const state = { values: { messages } };
  return {
    getState: jest.fn().mockResolvedValue(state),
    updateState: jest.fn().mockResolvedValue(undefined),
    stream: jest.fn(),
  } as unknown as HitlAgentApp;
}

const config = { configurable: { thread_id: 'test-thread' } };

describe('cancelPendingToolCalls', () => {
  it('cancels pending tool calls from the last AIMessage', async () => {
    const aiMessage = new AIMessage({ content: 'Calling tool' });
    (aiMessage as AIMessage & { tool_calls: unknown[] }).tool_calls = [
      { name: 'create_fields', id: 'tc-1', args: { data: [] } },
      { name: 'create_company', id: 'tc-2', args: { name: 'Test' } },
    ];

    const app = createMockApp([aiMessage]);
    const count = await cancelPendingToolCalls({ app, config, reason: 'test reason' });

    expect(count).toBe(2);
    expect(app.updateState).toHaveBeenCalledTimes(1);
    const updateCall = (app.updateState as jest.Mock).mock.calls[0];
    expect(updateCall[2]).toBe('tools');
    const cancellations = updateCall[1].messages;
    expect(cancellations).toHaveLength(2);
    expect(JSON.parse(cancellations[0].content)).toEqual({
      cancelled: true,
      reason: 'test reason',
    });
  });

  it('returns 0 when no messages exist', async () => {
    const app = createMockApp([]);
    const count = await cancelPendingToolCalls({ app, config, reason: 'test' });

    expect(count).toBe(0);
    expect(app.updateState).not.toHaveBeenCalled();
  });

  it('returns 0 when last message is not an AIMessage with tool_calls', async () => {
    const app = createMockApp([new HumanMessage('hello')]);
    const count = await cancelPendingToolCalls({ app, config, reason: 'test' });

    expect(count).toBe(0);
    expect(app.updateState).not.toHaveBeenCalled();
  });

  it('returns 0 when last AIMessage has empty tool_calls', async () => {
    const aiMessage = new AIMessage({ content: 'No tools' });
    (aiMessage as AIMessage & { tool_calls: unknown[] }).tool_calls = [];

    const app = createMockApp([aiMessage]);
    const count = await cancelPendingToolCalls({ app, config, reason: 'test' });

    expect(count).toBe(0);
    expect(app.updateState).not.toHaveBeenCalled();
  });

  it('skips tool calls without an id', async () => {
    const aiMessage = new AIMessage({ content: 'Calling tool' });
    (aiMessage as AIMessage & { tool_calls: unknown[] }).tool_calls = [
      { name: 'search_products', id: '', args: {} },
      { name: 'create_fields', id: 'tc-valid', args: {} },
    ];

    const app = createMockApp([aiMessage]);
    const count = await cancelPendingToolCalls({ app, config, reason: 'no id' });

    expect(count).toBe(1);
    const cancellations = (app.updateState as jest.Mock).mock.calls[0][1].messages;
    expect(cancellations).toHaveLength(1);
    expect(cancellations[0].name).toBe('create_fields');
  });
});
