import { ToolMessage, SystemMessage } from '@langchain/core/messages';
import { createAutoCriticNode, CRITIC_TARGET_TOOLS } from '../graph/auto-critic-node';
import type { DosageReactState } from '../type/state';

function makeState(messages: import('@langchain/core/messages').BaseMessage[]): DosageReactState {
  return {
    messages,
    loopCounter: 0,
    lastToolCalls: [],
    taskList: [],
  };
}

describe('auto-critic-node', () => {
  const autoCritic = createAutoCriticNode();

  describe('CRITIC_TARGET_TOOLS', () => {
    it('includes compute tools', () => {
      expect(CRITIC_TARGET_TOOLS.has('calculate_dosage')).toBe(true);
      expect(CRITIC_TARGET_TOOLS.has('validate_compliance')).toBe(true);
      expect(CRITIC_TARGET_TOOLS.has('optimize_dosage')).toBe(true);
      expect(CRITIC_TARGET_TOOLS.has('validate_sa_group_limits')).toBe(true);
    });

    it('does not include non-compute tools', () => {
      expect(CRITIC_TARGET_TOOLS.has('search_products')).toBe(false);
      expect(CRITIC_TARGET_TOOLS.has('list_user_companies')).toBe(false);
    });
  });

  describe('anomaly detection', () => {
    it('returns warning for negative dose', async () => {
      const toolMsg = new ToolMessage({
        content: JSON.stringify({
          dosageResults: [{ products: [{ treatments: [{ dosePerHa: -5 }] }] }],
        }),
        tool_call_id: 'call_1',
        name: 'calculate_dosage',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0]).toBeInstanceOf(SystemMessage);
      expect((result.messages![0] as SystemMessage).content).toContain('anomalia');
    });

    it('returns warning for dose > 100', async () => {
      const toolMsg = new ToolMessage({
        content: JSON.stringify({
          dosageResults: [{ products: [{ treatments: [{ dosePerHa: 150 }] }] }],
        }),
        tool_call_id: 'call_2',
        name: 'calculate_dosage',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result.messages).toHaveLength(1);
    });

    it('returns empty for normal dose', async () => {
      const toolMsg = new ToolMessage({
        content: JSON.stringify({
          dosageResults: [{ products: [{ treatments: [{ dosePerHa: 3.5 }] }] }],
        }),
        tool_call_id: 'call_3',
        name: 'calculate_dosage',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result.messages).toBeUndefined();
    });
  });

  describe('passthrough for non-target tools', () => {
    it('skips tools not in CRITIC_TARGET_TOOLS', async () => {
      const toolMsg = new ToolMessage({
        content: JSON.stringify({ companies: [] }),
        tool_call_id: 'call_4',
        name: 'list_user_companies',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result).toEqual({});
    });
  });

  describe('error handling', () => {
    it('skips messages with error in content', async () => {
      const toolMsg = new ToolMessage({
        content: JSON.stringify({ error: 'Something failed' }),
        tool_call_id: 'call_5',
        name: 'calculate_dosage',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result).toEqual({});
    });

    it('skips non-JSON content', async () => {
      const toolMsg = new ToolMessage({
        content: 'plain text result',
        tool_call_id: 'call_6',
        name: 'calculate_dosage',
      });
      const result = await autoCritic(makeState([toolMsg]));
      expect(result).toEqual({});
    });

    it('returns empty for empty messages', async () => {
      const result = await autoCritic(makeState([]));
      expect(result).toEqual({});
    });
  });
});
