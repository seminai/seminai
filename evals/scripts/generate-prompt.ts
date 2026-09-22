/**
 * Pre-build script: generates the full system prompt from the real source code.
 * Run with `npx tsx llm-test/scripts/generate-prompt.ts` before promptfoo eval.
 * Outputs JSON to llm-test/.generated/system-prompt.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildSystemPrompt } from '../../backend/src/infrastructure/services/agents/dosage_agent_react/prompt/system-prompt';
import type { SystemPromptOptions } from '../../backend/src/infrastructure/services/agents/dosage_agent_react/prompt/system-prompt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALL_FEATURES: SystemPromptOptions = {
  hasRulesSearch: true,
  hasJobOperationsSearch: true,
  hasDisciplinariPdf: true,
  hasBdfTools: true,
  hasTavilySearch: true,
  hasJobModification: true,
  hasContextDiscovery: true,
  hasPlanning: true,
  hasFieldNoteDelegation: true,
  hasProductLabelDb: true,
  hasEntityCreation: true,
  hasConformityCheck: true,
  hasJobManagement: true,
  hasProductRecommendation: true,
  hasPhotoDiagnosis: true,
};

const MINIMAL_FEATURES: SystemPromptOptions = {
  hasRulesSearch: false,
  hasJobOperationsSearch: false,
  hasDisciplinariPdf: false,
  hasBdfTools: true,
  hasTavilySearch: false,
  hasJobModification: false,
  hasContextDiscovery: false,
  hasPlanning: false,
  hasFieldNoteDelegation: false,
  hasProductLabelDb: false,
  hasEntityCreation: false,
  hasConformityCheck: false,
  hasJobManagement: false,
};

const output = {
  allFeatures: buildSystemPrompt(ALL_FEATURES),
  minimalFeatures: buildSystemPrompt(MINIMAL_FEATURES),
  generatedAt: new Date().toISOString(),
};

const outDir = path.join(__dirname, '..', '.generated');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'system-prompt.json'), JSON.stringify(output, null, 2));

console.log(
  `System prompt generated (${output.allFeatures.length} chars full, ${output.minimalFeatures.length} chars minimal)`,
);
