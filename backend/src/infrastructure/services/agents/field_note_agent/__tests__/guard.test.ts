import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { createFieldNoteGuardNode } from '../graph';
import type { AgentState } from '../types';

describe('field note guard node', () => {
  it('cancels pending tool calls and emits a final message on repeated tool patterns', async () => {
    const aiMessage = new AIMessage({ content: '' });
    (
      aiMessage as AIMessage & {
        tool_calls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
      }
    ).tool_calls = [{ name: 'find_user_products', args: {}, id: 'tc-field-loop' }];

    const state: AgentState = {
      messages: [aiMessage],
      toolCallCount: 4,
      lastToolCalls: [
        'find_user_products',
        'find_user_products',
        'find_user_products',
        'find_user_products',
      ],
    };

    const result = await createFieldNoteGuardNode()(state);

    expect(result.toolCallCount).toBe(5);
    expect(result.lastToolCalls).toEqual([
      'find_user_products',
      'find_user_products',
      'find_user_products',
      'find_user_products',
      'find_user_products',
    ]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages?.[0]).toBeInstanceOf(ToolMessage);
    expect((result.messages?.[0] as ToolMessage).tool_call_id).toBe('tc-field-loop');
    expect(String(result.messages?.[0].content)).toContain('"loopDetected":true');
    expect(result.messages?.[1]).toBeInstanceOf(AIMessage);
    expect(String(result.messages?.[1].content)).toContain('Mi sono fermato');
  });
});
