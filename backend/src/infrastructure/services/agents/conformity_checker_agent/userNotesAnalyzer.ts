import type { ConformityViolation } from './types';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { executeLlmCallWithProtection } from '../dosage_agent/llmErrorHandler';
import { createChatModel } from '../../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();
const CONFORMITY_CHECK_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const CONFORMITY_CHECK_TEMPERATURE = 0.2;
const CIRCUIT_BREAKER_NAME = 'llm-conformity-notes';

/**
 * Result of user notes analysis
 */
export interface UserNotesAnalysisResult {
  readonly appliedRules: string[];
  readonly ignoredRules: string[];
  readonly warnings: ConformityViolation[];
}

const EMPTY_RESULT: UserNotesAnalysisResult = {
  appliedRules: [],
  ignoredRules: [],
  warnings: [],
};

/**
 * Builds the prompt for user notes analysis
 */
function buildUserNotesPrompt(notes: string): string {
  return `Sei un agronomo esperto. Analizza le seguenti note dell'utente ed estrai:
1. Regole agronomiche valide da applicare ai trattamenti
2. Richieste che vanno ignorate perché potrebbero violare le norme di sicurezza dell'etichetta

NOTE UTENTE:
${notes}

IMPORTANTE:
- Le regole dell'etichetta (dose massima, intervallo applicazioni, ecc.) hanno SEMPRE priorità
- Non accettare richieste che violano i vincoli dell'etichetta
- Estrai solo regole ragionevoli e applicabili

Rispondi in JSON:
{
  "appliedRules": ["regola 1", "regola 2"],
  "ignoredRules": ["regola ignorata con motivazione"],
  "warnings": ["avviso per l'utente"]
}`;
}

/**
 * Parses LLM response and extracts analysis result
 */
function parseAnalysisResponse(content: string): UserNotesAnalysisResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return EMPTY_RESULT;
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const warnings: ConformityViolation[] = (parsed.warnings || []).map((w: string) => ({
    type: 'USER_NOTE_WARNING' as const,
    message: w,
    severity: 'WARNING' as const,
    source: 'USER_NOTES' as const,
  }));

  return {
    appliedRules: parsed.appliedRules || [],
    ignoredRules: parsed.ignoredRules || [],
    warnings,
  };
}

/**
 * Core LLM call for user notes analysis (extracted for circuit breaker wrapping)
 */
async function invokeUserNotesLlm(notes: string): Promise<UserNotesAnalysisResult> {
  const { model: llm, modelName } = createChatModel({
    modelName: CONFORMITY_CHECK_MODEL,
    temperature: CONFORMITY_CHECK_TEMPERATURE,
    maxTokens: 1000,
  });

  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const prompt = buildUserNotesPrompt(notes);
  const response = await llm.invoke(prompt, { callbacks: [usageCollector] });

  // Log usage asynchronously
  usageLogger
    .logFromAccumulator(usageAccumulator, {
      jobType: LlmJobType.CONFORMITY_CHECK,
      model: modelName,
      metadata: { step: 'user-notes-analysis' },
    })
    .catch((err) => console.warn('[CONFORMITY-CHECKER] Failed to log usage:', err));

  const content = typeof response.content === 'string' ? response.content : '';
  return parseAnalysisResponse(content);
}

/**
 * Analyzes user notes with LLM to extract agronomic rules.
 * Protected by circuit breaker - returns empty result on failure or circuit open.
 */
export async function analyzeUserNotes(notes: string): Promise<UserNotesAnalysisResult> {
  if (!notes || notes.trim().length === 0) {
    return EMPTY_RESULT;
  }

  const result = await executeLlmCallWithProtection({
    circuitBreakerName: CIRCUIT_BREAKER_NAME,
    operation: () => invokeUserNotesLlm(notes),
    fallback: EMPTY_RESULT,
    context: 'conformity-checker-user-notes',
  });

  if (result.fromFallback) {
    console.warn(
      `[CONFORMITY-CHECKER] User notes analysis used fallback: ${result.error?.type ?? 'unknown'}`,
    );
  }

  return result.data ?? EMPTY_RESULT;
}
