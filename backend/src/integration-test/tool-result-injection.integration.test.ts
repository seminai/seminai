import {
  wrapToolWithReminder,
  COMPLIANCE_REMINDER,
  TOOLS_REQUIRING_REMINDER,
} from '../infrastructure/services/agents/dosage_agent_react/tools/tool-result-wrapper';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

function createMockTool(name: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description: `Mock tool ${name}`,
    schema: z.object({ input: z.string().optional() }),
    func: async () => JSON.stringify({ result: `output from ${name}` }),
  });
}

describe('tool-result-injection', () => {
  it('wraps validate_compliance and preserves valid JSON output', async () => {
    const tool = createMockTool('validate_compliance');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    const parsed = JSON.parse(result);
    expect(parsed.result).toBe('output from validate_compliance');
    expect(parsed.complianceReminder).toBe(COMPLIANCE_REMINDER.trim());
  });

  it('wraps search_product_label_database and preserves valid JSON output', async () => {
    const tool = createMockTool('search_product_label_database');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    const parsed = JSON.parse(result);
    expect(parsed.complianceReminder).toBe(COMPLIANCE_REMINDER.trim());
  });

  it('wraps enrich_from_bdf and preserves valid JSON output', async () => {
    const tool = createMockTool('enrich_from_bdf');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    const parsed = JSON.parse(result);
    expect(parsed.complianceReminder).toBe(COMPLIANCE_REMINDER.trim());
  });

  it('wraps calculate_dosage and preserves valid JSON output', async () => {
    const tool = createMockTool('calculate_dosage');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    const parsed = JSON.parse(result);
    expect(parsed.complianceReminder).toBe(COMPLIANCE_REMINDER.trim());
  });

  it('does NOT add reminder to expand_production_cycles', async () => {
    const tool = createMockTool('expand_production_cycles');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    expect(result).not.toContain(COMPLIANCE_REMINDER);
  });

  it('COMPLIANCE_REMINDER contains required phrases', () => {
    expect(COMPLIANCE_REMINDER).toContain('etichetta ministeriale');
    expect(COMPLIANCE_REMINDER).toContain('disciplinare regionale');
    expect(COMPLIANCE_REMINDER).toContain('priorità fonti');
  });

  it('TOOLS_REQUIRING_REMINDER contains expected tool names', () => {
    const expected = [
      'validate_compliance',
      'search_product_label_database',
      'enrich_from_bdf',
      'calculate_dosage',
      'validate_sa_group_limits',
    ];
    expected.forEach((name) => expect(TOOLS_REQUIRING_REMINDER.has(name)).toBe(true));
    expect(TOOLS_REQUIRING_REMINDER.size).toBe(expected.length);
  });

  it('preserves original tool result before reminder', async () => {
    const tool = createMockTool('validate_compliance');
    const wrapped = wrapToolWithReminder(tool);
    const result = await wrapped.invoke({});
    const parsed = JSON.parse(result);
    expect(parsed.result).toBe('output from validate_compliance');
  });
});
