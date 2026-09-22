import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

jest.mock('../graph/durable-execution', () => ({
  createDurableTask:
    (_name: string, fn: (input: unknown) => Promise<unknown>) => (input: unknown) =>
      fn(input),
}));

import { createAgentNode } from '../graph/nodes';
import { clearWorkingMemory } from '../working-memory';

describe('createAgentNode', () => {
  const threadId = 'agent-node-thread';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
  });

  it('always prepends the immutable base system prompt even when state already has system messages', async () => {
    const invokeMock = jest.fn().mockResolvedValue(new AIMessage('ok'));
    const node = createAgentNode({
      modelWithTools: { invoke: invokeMock } as never,
      systemPromptText: 'BASE_SYSTEM_PROMPT',
      modelName: 'test-model',
      threadId,
    });

    await node({
      messages: [new SystemMessage('planner reminder'), new HumanMessage('ciao')],
      loopCounter: 0,
      lastToolCalls: [],
      taskList: [],
    });

    const llmMessages = invokeMock.mock.calls[0][0] as Array<SystemMessage | HumanMessage>;
    expect(llmMessages[0]).toBeInstanceOf(SystemMessage);
    expect(llmMessages[0].content).toBe('BASE_SYSTEM_PROMPT');
    expect(llmMessages[1]).toBeInstanceOf(SystemMessage);
    expect(llmMessages[1].content).toBe('planner reminder');
    expect(llmMessages[2]).toBeInstanceOf(HumanMessage);
  });

  it('selects the high model after dosage calculation tools', async () => {
    const lowInvoke = jest.fn().mockResolvedValue(new AIMessage('low'));
    const mediumInvoke = jest.fn().mockResolvedValue(new AIMessage('medium'));
    const highInvoke = jest.fn().mockResolvedValue(new AIMessage('high'));
    const node = createAgentNode({
      models: {
        low: {
          modelWithTools: { invoke: lowInvoke } as never,
          modelName: 'low-model',
          provider: 'openrouter',
          complexity: 'low',
        },
        medium: {
          modelWithTools: { invoke: mediumInvoke } as never,
          modelName: 'medium-model',
          provider: 'openrouter',
          complexity: 'medium',
        },
        high: {
          modelWithTools: { invoke: highInvoke } as never,
          modelName: 'high-model',
          provider: 'openrouter',
          complexity: 'high',
        },
      },
      systemPromptText: 'BASE_SYSTEM_PROMPT',
      threadId,
    });

    const result = await node({
      messages: [new HumanMessage('crea la bozza')],
      loopCounter: 1,
      lastToolCalls: ['calculate_dosage'],
      taskList: [],
    });

    expect(lowInvoke).not.toHaveBeenCalled();
    expect(mediumInvoke).not.toHaveBeenCalled();
    expect(highInvoke).toHaveBeenCalled();
    expect(result.selectedModel).toEqual({
      provider: 'openrouter',
      modelName: 'high-model',
      complexity: 'high',
    });
  });

  it('adds a final-answer hint after diagnose_from_photo ran in the current turn', async () => {
    const invokeMock = jest.fn().mockResolvedValue(new AIMessage('ok'));
    const node = createAgentNode({
      modelWithTools: { invoke: invokeMock } as never,
      systemPromptText: 'BASE_SYSTEM_PROMPT',
      modelName: 'test-model',
      threadId,
    });

    await node({
      messages: [
        new HumanMessage('Che problema ha questa pianta?'),
        new ToolMessage({
          content: JSON.stringify({ status: 'diagnosed' }),
          tool_call_id: 'call-diagnose',
          name: 'diagnose_from_photo',
        }),
      ],
      loopCounter: 1,
      lastToolCalls: ['diagnose_from_photo'],
      taskList: [],
    });

    const llmMessages = invokeMock.mock.calls[0][0] as Array<SystemMessage | HumanMessage>;
    const lastMessage = llmMessages[llmMessages.length - 1] as SystemMessage;
    expect(lastMessage).toBeInstanceOf(SystemMessage);
    expect(lastMessage.content).toContain('Photo Diagnosis Final Reply');
    expect(lastMessage.content).toContain('Do not call recommend_best_products');
  });
});
