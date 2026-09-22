import {
  classifyRisk,
  shouldAutoApprove,
  type RiskClassification,
} from '../infrastructure/services/agents/dosage_agent_react/graph/risk-classifier';
import { createAutoCriticNode } from '../infrastructure/services/agents/dosage_agent_react/graph/auto-critic-node';
import { routeAfterTools } from '../infrastructure/services/agents/dosage_agent_react/graph/routing';
import { ToolMessage, SystemMessage } from '@langchain/core/messages';
import type { DosageReactState } from '../infrastructure/services/agents/dosage_agent_react/type/state';

const baseState: DosageReactState = {
  messages: [],
  loopCounter: 0,
  lastToolCalls: [],
  taskList: [],
};

describe('Risk Classifier integration', () => {
  it('create_treatment_jobs with 3 jobs → score >= 30, requires approval', () => {
    const actual = classifyRisk('create_treatment_jobs', {
      jobIds: ['a', 'b', 'c'],
    });
    expect(actual.score).toBeGreaterThanOrEqual(30);
    expect(actual.level).not.toBe('low');
    expect(shouldAutoApprove(actual)).toBe(false);
  });

  it('bulk operation (80 jobs) → score > 70, level high', () => {
    const actual = classifyRisk('optimize_selected_jobs', {
      selectedJobIds: Array(80).fill('x'),
    });
    expect(actual.score).toBeGreaterThan(70);
    expect(actual.level).toBe('high');
  });

  it('import_from_file with overwrite → high risk', () => {
    const actual = classifyRisk('import_from_file', { overwrite: true });
    expect(actual.score).toBeGreaterThan(50);
  });

  it('Non-destructive tool → low risk', () => {
    const actual = classifyRisk('search_products', {});
    expect(actual.score).toBe(5);
    expect(actual.level).toBe('low');
  });

  it('Unknown tool → medium risk, requires approval by default', () => {
    const actual = classifyRisk('new_unclassified_tool', {});
    expect(actual.score).toBe(50);
    expect(actual.level).toBe('medium');
    expect(shouldAutoApprove(actual)).toBe(false);
  });

  it('shouldAutoApprove with low risk returns true', () => {
    const classification: RiskClassification = {
      score: 10,
      level: 'low',
      reason: 'test',
    };
    expect(shouldAutoApprove(classification)).toBe(true);
  });

  it('shouldAutoApprove with medium risk returns false', () => {
    const classification: RiskClassification = {
      score: 50,
      level: 'medium',
      reason: 'test',
    };
    expect(shouldAutoApprove(classification)).toBe(false);
  });
});

describe('Auto-Critic integration', () => {
  const autoCriticNode = createAutoCriticNode();

  it('detects anomalous dose', async () => {
    const content = JSON.stringify({
      dosageResults: [
        {
          products: [{ treatments: [{ dosePerHa: 150 }] }],
        },
      ],
    });
    const state: DosageReactState = {
      ...baseState,
      messages: [new ToolMessage({ content, name: 'calculate_dosage', tool_call_id: 'tc1' })],
    };
    const result = await autoCriticNode(state);
    expect(result.messages).toBeDefined();
    expect(result.messages!.length).toBe(1);
    expect(result.messages![0]).toBeInstanceOf(SystemMessage);
    expect((result.messages![0] as SystemMessage).content).toContain('ATTENZIONE');
  });

  it('normal dose passes', async () => {
    const content = JSON.stringify({
      dosageResults: [
        {
          products: [{ treatments: [{ dosePerHa: 5 }] }],
        },
      ],
    });
    const state: DosageReactState = {
      ...baseState,
      messages: [new ToolMessage({ content, name: 'calculate_dosage', tool_call_id: 'tc2' })],
    };
    const result = await autoCriticNode(state);
    expect(result).toEqual({});
  });

  it('error field skipped', async () => {
    const content = JSON.stringify({ error: 'some error' });
    const state: DosageReactState = {
      ...baseState,
      messages: [new ToolMessage({ content, name: 'calculate_dosage', tool_call_id: 'tc3' })],
    };
    const result = await autoCriticNode(state);
    expect(result).toEqual({});
  });
});

describe('routeAfterTools integration', () => {
  it('compute tool routes to autoCritic', () => {
    const state: DosageReactState = {
      ...baseState,
      messages: [new ToolMessage({ content: '{}', name: 'calculate_dosage', tool_call_id: 'tc4' })],
    };
    const actual = routeAfterTools(state);
    expect(actual).toBe('autoCritic');
  });

  it('non-compute tool routes to contextCompressor', () => {
    const state: DosageReactState = {
      ...baseState,
      messages: [new ToolMessage({ content: '[]', name: 'search_products', tool_call_id: 'tc5' })],
    };
    const actual = routeAfterTools(state);
    expect(actual).toBe('contextCompressor');
  });
});
