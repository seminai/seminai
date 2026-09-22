import { DisciplinariExtractedData, DefenseTarget, AllowedIntervention } from '../../../domain/dtos/disciplinari.dto';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { createEmptyExtraction, sanitizeDisciplinariExtraction, sanitizeStringArray } from './extractDataFromDisciplinari.part-04-create-empty-extraction';
import { DisciplinariExtractionContext, buildSectionChunks, estimateTokens, pMap, splitTextIntoSections } from './extractDataFromDisciplinari.part-01-usage-logger';
import { extractSingleChunk, mergePartialExtractions } from './extractDataFromDisciplinari.part-03-extract-single-chunk';

export function sanitizeDefenseTargets(raw: unknown): DefenseTarget[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      target: {
        name:
          typeof item.target === 'object' && item.target !== null
            ? String((item.target as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        type: sanitizeTargetType(
          typeof item.target === 'object' && item.target !== null
            ? (item.target as Record<string, unknown>).type
            : 'altro',
        ),
      },
      monitoring: sanitizeStringArray(item.monitoring),
      agronomicMeasures: sanitizeStringArray(item.agronomicMeasures),
      biologicalMeasures: sanitizeStringArray(item.biologicalMeasures),
      interventions: sanitizeInterventions(item.interventions),
    }));
}

export function sanitizeTargetType(raw: unknown): 'insetto' | 'fungo' | 'infestante' | 'altro' {
  const valid = ['insetto', 'fungo', 'infestante', 'altro'];
  const value = String(raw || 'altro').toLowerCase();
  return valid.includes(value) ? (value as 'insetto' | 'fungo' | 'infestante' | 'altro') : 'altro';
}

export function sanitizeInterventions(raw: unknown): AllowedIntervention[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      productOrActive: {
        name:
          typeof item.productOrActive === 'object' && item.productOrActive !== null
            ? String((item.productOrActive as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        normalized:
          typeof item.productOrActive === 'object' && item.productOrActive !== null
            ? ((item.productOrActive as Record<string, unknown>).normalized as string) || null
            : null,
      },
      formulation: typeof item.formulation === 'string' ? item.formulation : null,
      dose: sanitizeDose(item.dose),
      applications: sanitizeApplications(item.applications),
      interval: {
        minDays:
          typeof item.interval === 'object' && item.interval !== null
            ? ((item.interval as Record<string, unknown>).minDays as number) || null
            : null,
      },
      phi:
        typeof item.phi === 'object' && item.phi !== null
          ? {
              preharvestIntervalDays:
                ((item.phi as Record<string, unknown>).preharvestIntervalDays as number) || null,
            }
          : null,
      phenology: {
        from:
          typeof item.phenology === 'object' && item.phenology !== null
            ? ((item.phenology as Record<string, unknown>).from as string) || null
            : null,
        to:
          typeof item.phenology === 'object' && item.phenology !== null
            ? ((item.phenology as Record<string, unknown>).to as string) || null
            : null,
      },
      constraints: sanitizeStringArray(item.constraints),
      environmentalConstraints: sanitizeStringArray(item.environmentalConstraints),
      resistanceManagement: sanitizeStringArray(item.resistanceManagement),
      notes: typeof item.notes === 'string' ? item.notes : null,
      sourceLocator: {
        page:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).page as number) || null
            : null,
        tableId:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).tableId as string) || null
            : null,
        rowHint:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).rowHint as string) || null
            : null,
      },
    }));
}

export function sanitizeDose(raw: unknown): {
  min: number | null;
  max: number | null;
  unit: string | null;
  notes: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { min: null, max: null, unit: null, notes: null };
  }

  const data = raw as Record<string, unknown>;
  return {
    min: typeof data.min === 'number' ? data.min : null,
    max: typeof data.max === 'number' ? data.max : null,
    unit: typeof data.unit === 'string' ? data.unit : null,
    notes: typeof data.notes === 'string' ? data.notes : null,
  };
}

export function sanitizeApplications(raw: unknown): {
  min: number | null;
  max: number | null;
  scope: 'anno' | 'ciclo colturale' | 'stagione' | 'finestra fenologica' | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { min: null, max: null, scope: null };
  }

  const data = raw as Record<string, unknown>;
  const validScopes = ['anno', 'ciclo colturale', 'stagione', 'finestra fenologica'];
  const scope =
    typeof data.scope === 'string' && validScopes.includes(data.scope) ? data.scope : null;

  return {
    min: typeof data.min === 'number' ? data.min : null,
    max: typeof data.max === 'number' ? data.max : null,
    scope: scope as 'anno' | 'ciclo colturale' | 'stagione' | 'finestra fenologica' | null,
  };
}

/**
 * Main function to extract structured data from disciplinari text.
 * Implements chunking for long documents (50+ pages).
 */
export async function extractStructuredDisciplinariData(
  text: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<DisciplinariExtractedData> {
  const inputText = text || '';
  const estimatedTokens_count = estimateTokens(inputText);
  // Reduced to 50000 tokens per chunk to leave room for prompt (~20k) and response (~10k) (GPT-4o limit is 128k)
  const MAX_TOKENS_PER_CHUNK = 50000;
  const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * 3.5; // Conservative estimate: 3.5 chars per token

  console.log(
    `[DISCIPLINARI_EXTRACTION] Starting extraction. Estimated tokens: ${estimatedTokens_count}, chars: ${inputText.length}`,
  );

  if (inputText.length === 0) {
    return createEmptyExtraction(['Empty input text']);
  }

  if (estimatedTokens_count <= MAX_TOKENS_PER_CHUNK) {
    console.log('[DISCIPLINARI_EXTRACTION] Single chunk extraction');
    const result = await extractSingleChunk(inputText, 0, 1, callbacks, context);
    return sanitizeDisciplinariExtraction(result);
  }

  console.log('[DISCIPLINARI_EXTRACTION] Multi-chunk extraction required');
  const sections = splitTextIntoSections(inputText);
  console.log(`[DISCIPLINARI_EXTRACTION] Found ${sections.length} sections`);

  const chunks = buildSectionChunks(sections, MAX_CHARS_PER_CHUNK);
  console.log(`[DISCIPLINARI_EXTRACTION] Split into ${chunks.length} chunks`);

  // Process chunks in parallel with controlled concurrency (max 4 concurrent)
  const CHUNK_CONCURRENCY = 4;
  console.log(
    `[DISCIPLINARI_EXTRACTION] Processing ${chunks.length} chunks with concurrency ${CHUNK_CONCURRENCY}`,
  );

  const partials = await pMap(
    chunks,
    async (chunk, i) => extractSingleChunk(chunk, i, chunks.length, callbacks, context),
    CHUNK_CONCURRENCY,
  );

  if (partials.length === 1) {
    return sanitizeDisciplinariExtraction(partials[0]);
  }

  return mergePartialExtractions(partials, callbacks, context);
}
