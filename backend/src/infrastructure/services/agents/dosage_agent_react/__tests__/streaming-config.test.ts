import { AIMessage } from '@langchain/core/messages';
import { streamReactAgent } from '../streaming';
import { createReactAgent } from '../DosageReactAgent';
import { computeReactRuntimeBudget } from '../graph/react-runtime-budget';

jest.mock('../DosageReactAgent', () => ({
  createReactAgent: jest.fn(),
  extractSourcesFromMessages: jest.fn(() => []),
}));

jest.mock('../user-message-context-builder', () => ({
  buildUserMessageContext: jest.fn(async ({ userMessage }) => ({ enrichedMessage: userMessage })),
}));

describe('streamReactAgent config', () => {
  it('passes the configured recursion limit to LangGraph streaming', async () => {
    const streamConfigs: Array<Record<string, unknown>> = [];
    const streamInputs: Array<Record<string, unknown>> = [];
    const messages = [new AIMessage({ content: 'ok' })];
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages, taskList: [], lastToolCalls: [] },
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

    (createReactAgent as jest.Mock).mockResolvedValue(app);

    const events = [];
    for await (const event of streamReactAgent({
      threadId: 'thread-streaming-config',
      userMessage: 'ciao',
    })) {
      events.push(event);
    }

    expect(streamConfigs).toHaveLength(1);
    expect(streamConfigs[0].recursionLimit).toBe(computeReactRuntimeBudget().recursionLimit);
    expect(streamInputs[0].loopCounter).toBe(0);
    expect(streamInputs[0].lastToolCalls).toEqual([]);
    expect(streamInputs[0].lastToolCallRecords).toEqual([]);
    expect(events.some((event) => event.type === 'complete')).toBe(true);
  });

  it('emits model_selected updates from the agent node', async () => {
    const messages = [new AIMessage({ content: 'ok' })];
    const app = {
      getState: jest.fn().mockResolvedValue({
        values: { messages, taskList: [], lastToolCalls: [] },
      }),
      stream: jest.fn(async () => ({
        async *[Symbol.asyncIterator]() {
          yield [
            'updates',
            {
              agent: {
                selectedModel: {
                  provider: 'openrouter',
                  modelName: 'openai/gpt-4o',
                  complexity: 'high',
                },
              },
            },
          ];
        },
      })),
    };
    (createReactAgent as jest.Mock).mockResolvedValue(app);

    const events = [];
    for await (const event of streamReactAgent({
      threadId: 'thread-model-selected',
      userMessage: 'ciao',
    })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'model_selected',
      modelInfo: {
        provider: 'openrouter',
        modelName: 'openai/gpt-4o',
        complexity: 'high',
      },
    });
  });
});
