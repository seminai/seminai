import { DynamicStructuredTool } from '@langchain/core/tools';
import { classifyRisk } from '../graph/risk-classifier';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';
import type { AnalyticsGroup } from '../../../../../domain/services/IAnalyticsService';

/** Identity used to attribute a `tool_invoked` event. */
export interface AnalyticsToolContext {
  readonly userId?: string;
  readonly companyId?: string;
  readonly workspaceId?: string;
}

function buildGroups(ctx: AnalyticsToolContext): AnalyticsGroup[] {
  const groups: AnalyticsGroup[] = [];
  if (ctx.companyId) groups.push({ type: 'company', key: ctx.companyId });
  if (ctx.workspaceId) groups.push({ type: 'workspace', key: ctx.workspaceId });
  return groups;
}

/**
 * Wraps a tool so every invocation emits a `tool_invoked` analytics event with
 * the tool's risk classification. Applied as the OUTERMOST wrapper so it sees
 * the real tool name and fires once per call. Fire-and-forget: analytics
 * errors never block tool execution.
 */
export function wrapToolWithAnalytics(
  tool: DynamicStructuredTool,
  ctx: AnalyticsToolContext,
): DynamicStructuredTool {
  const originalFunc = tool.func.bind(tool);
  const groups = buildGroups(ctx);

  const wrapped = new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    responseFormat: tool.responseFormat,
    returnDirect: tool.returnDirect,
    verboseParsingErrors: tool.verboseParsingErrors,
    func: async (input, runManager) => {
      try {
        const classification = classifyRisk(tool.name, (input ?? {}) as Record<string, unknown>);
        getAnalyticsService().capture({
          distinctId: ctx.userId ?? 'system',
          event: 'tool_invoked',
          properties: {
            tool_name: tool.name,
            risk_level: classification.level,
            risk_score: classification.score,
          },
          groups: groups.length > 0 ? groups : undefined,
        });
      } catch {
        // Analytics must never block tool execution.
      }
      return originalFunc(input, runManager);
    },
  });

  wrapped.extras = tool.extras;
  wrapped.defaultConfig = tool.defaultConfig;
  return wrapped;
}
