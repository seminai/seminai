import { DynamicStructuredTool } from '@langchain/core/tools';

const COMPLIANCE_REMINDER = `
---
REMINDER: Verifica sempre etichetta ministeriale + disciplinare regionale prima di procedere. Rispetta la priorità fonti: etichetta > disciplinare > BDF > Tavily.`;

const TOOLS_REQUIRING_REMINDER = new Set([
  'validate_compliance',
  'search_product_label_database',
  'enrich_from_bdf',
  'calculate_dosage',
  'validate_sa_group_limits',
]);

/**
 * Wraps a tool so its result string is appended with a compliance reminder.
 * Only applies to tools in the TOOLS_REQUIRING_REMINDER set.
 */
export function wrapToolWithReminder(tool: DynamicStructuredTool): DynamicStructuredTool {
  if (!TOOLS_REQUIRING_REMINDER.has(tool.name)) {
    return tool;
  }

  const originalFunc = tool.func.bind(tool);

  const wrapped = new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    func: async (input, runManager) => {
      const result = await originalFunc(input, runManager);
      if (typeof result !== 'string') {
        return result;
      }

      try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        return JSON.stringify({
          ...parsed,
          complianceReminder: COMPLIANCE_REMINDER.trim(),
        });
      } catch {
        return JSON.stringify({
          result,
          complianceReminder: COMPLIANCE_REMINDER.trim(),
        });
      }
    },
  });

  return wrapped;
}

/**
 * Wraps all tools in an array, adding compliance reminders where appropriate.
 */
export function wrapToolsWithReminders(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
  return tools.map(wrapToolWithReminder);
}

export { COMPLIANCE_REMINDER, TOOLS_REQUIRING_REMINDER };
