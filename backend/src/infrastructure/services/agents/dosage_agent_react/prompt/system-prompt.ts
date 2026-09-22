/**
 * Dynamic system prompt builder for the Dosage ReAct Agent.
 * Follows the SOUL / AGENTS / TOOLS pattern inspired by OpenClaw bootstrap files.
 *
 * Delegates to focused builder modules:
 *   - soul-prompt.constant.ts  → Agent persona
 *   - agents-prompt.builder.ts → Operating instructions and workflows
 *   - tools-prompt.builder.ts  → Per-tool guidance
 */

import { SOUL_PROMPT } from './soul-prompt.constant';
import { MANUFACTURING_SOUL_PROMPT } from './manufacturing-soul-prompt.constant';
import { buildAgentsPrompt } from './agents-prompt.builder';
import { buildLabelQueryPrompt } from './label-query-prompt.builder';
import { buildToolsPrompt } from './tools-prompt.builder';

/** Domain the prompt is assembled for. Defaults to the agronomic dosage agent. */
export type AgentPromptDomain = 'DOSAGE' | 'MANUFACTURING';

export interface SystemPromptOptions {
  readonly domain?: AgentPromptDomain;
  readonly hasRulesSearch: boolean;
  readonly hasJobOperationsSearch: boolean;
  readonly hasDisciplinariPdf: boolean;
  readonly hasBdfTools: boolean;
  readonly hasTavilySearch: boolean;
  readonly hasJobModification: boolean;
  readonly hasContextDiscovery?: boolean;
  readonly hasPlanning?: boolean;
  readonly hasFieldNoteDelegation?: boolean;
  readonly hasProductLabelDb?: boolean;
  readonly hasEntityCreation?: boolean;
  readonly hasConformityCheck?: boolean;
  readonly hasJobManagement?: boolean;
  readonly hasProductRecommendation?: boolean;
  readonly hasPhotoDiagnosis?: boolean;
}

/**
 * Build the full system prompt dynamically based on available tools.
 *
 * The current-date header is critical: without it, the LLM falls back to its
 * training cutoff and resolves user phrasing like "prossimi 3 mesi a partire da
 * oggi" with dates from 2023/2024, which downstream tools reject as past dates.
 */
export function buildSystemPrompt(options: SystemPromptOptions, now: Date = new Date()): string {
  const todayIso = now.toISOString().slice(0, 10);
  const dateHeader = `DATA CORRENTE: ${todayIso}. Usa questa data come riferimento per qualsiasi espressione temporale relativa ("oggi", "domani", "tra X giorni", "prossimi N mesi", "questa stagione"). NON usare la tua data di training.`;
  const soul = options.domain === 'MANUFACTURING' ? MANUFACTURING_SOUL_PROMPT : SOUL_PROMPT;
  return [
    dateHeader,
    soul,
    buildAgentsPrompt(options),
    buildLabelQueryPrompt(options),
    buildToolsPrompt(options),
  ]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}
