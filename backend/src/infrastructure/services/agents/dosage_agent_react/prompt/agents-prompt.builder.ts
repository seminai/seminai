/**
 * AGENTS — Operating instructions section of the Dosage ReAct Agent system prompt.
 * Describes workflows, approval rules, working memory layout, and delegation patterns.
 */
import type { SystemPromptOptions } from './system-prompt';
import { buildManufacturingAgentsPrompt } from './manufacturing-agents-prompt.builder';
import { appendAgentsPromptPart1 } from './agents-prompt.part-01';
import { appendAgentsPromptPart2 } from './agents-prompt.part-02';

export function buildAgentsPrompt(options: SystemPromptOptions): string {
  if (options.domain === 'MANUFACTURING') {
    return buildManufacturingAgentsPrompt(options);
  }

  const lines: string[] = [];
  appendAgentsPromptPart1(lines, options);
  appendAgentsPromptPart2(lines, options);


  return lines.join('\n\n');
}
