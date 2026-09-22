import { createHash } from 'node:crypto';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback, extractResponseText } from './llmProvider';
import type { DosageAgentContext } from './context';

export type DisciplinariLimitsKind = 'applications' | 'dosage';

const DisciplinariChunkLimitsSchema = z.object({
  maxApplications: z.number().int().nullable(),
  minIntervalDays: z.number().int().nullable(),
  doseMin: z.number().nullable(),
  doseMax: z.number().nullable(),
  unitOfMeasure: z.string().nullable(),
  found: z.boolean(),
  evidence: z.string().nullable(),
});

export type DisciplinariChunkLimits = z.infer<typeof DisciplinariChunkLimitsSchema>;

export interface DisciplinariChunkLimitsContext {
  readonly productName: string;
  readonly cropName: string;
  readonly variety?: string;
  readonly epoca?: string;
  readonly region?: string;
}

const EMPTY_LIMITS: DisciplinariChunkLimits = {
  maxApplications: null,
  minIntervalDays: null,
  doseMin: null,
  doseMax: null,
  unitOfMeasure: null,
  found: false,
  evidence: null,
};

const parser = StructuredOutputParser.fromZodSchema(DisciplinariChunkLimitsSchema);
const chunkCache = new Map<string, DisciplinariChunkLimits>();

type LlmInvoker = (prompt: string) => Promise<DisciplinariChunkLimits>;

function buildCacheKey(text: string, kind: DisciplinariLimitsKind): string {
  const digest = createHash('sha256').update(text).update(kind).digest('hex');
  return digest;
}

function buildPrompt(
  text: string,
  kind: DisciplinariLimitsKind,
  context: DisciplinariChunkLimitsContext,
): string {
  const focus =
    kind === 'applications'
      ? 'Extract ONLY max applications per year/cycle and minimum interval days between treatments.'
      : 'Extract ONLY minimum and maximum dose per hectare with unit (kg/ha, l/ha, g/hl).';
  return `You extract structured limits from Italian agricultural disciplinari (integrated production rules).
${focus}
Return null for fields not explicitly present. Do NOT invent values.
Set found=true only when at least one relevant limit is present.

Context:
- Product: ${context.productName}
- Crop: ${context.cropName}${context.variety ? ` (${context.variety})` : ''}
- Epoca: ${context.epoca ?? 'N/A'}
- Region: ${context.region ?? 'N/A'}

Chunk:
${text}

${parser.getFormatInstructions()}`;
}

async function defaultLlmInvoker(
  prompt: string,
  dosageContext?: DosageAgentContext,
): Promise<DisciplinariChunkLimits> {
  const { result } = await callWithFallback<DisciplinariChunkLimits>({
    operation: 'disciplinari-limits',
    context: dosageContext,
    modelOptions: { temperature: 0, maxTokens: 250 },
    execute: async (llm) => {
      const response = await llm.invoke(prompt);
      const content = extractResponseText(response.content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return EMPTY_LIMITS;
      }
      return parser.parse(jsonMatch[0]);
    },
  });
  return result;
}

/**
 * Extracts application or dosage limits from a disciplinari RAG chunk via mini-LLM.
 */
export async function extractDisciplinariChunkLimits(params: {
  readonly text: string;
  readonly kind: DisciplinariLimitsKind;
  readonly context: DisciplinariChunkLimitsContext;
  readonly dosageContext?: DosageAgentContext;
  readonly llmInvoker?: LlmInvoker;
}): Promise<DisciplinariChunkLimits> {
  const trimmed = params.text.trim();
  if (!trimmed) {
    return EMPTY_LIMITS;
  }
  const cacheKey = buildCacheKey(trimmed, params.kind);
  const cached = chunkCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const prompt = buildPrompt(trimmed, params.kind, params.context);
  try {
    const invoke = params.llmInvoker ?? ((p) => defaultLlmInvoker(p, params.dosageContext));
    const result = await invoke(prompt);
    chunkCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(
      '[DISCIPLINARI-LIMITS] Extraction failed:',
      error instanceof Error ? error.message : error,
    );
    chunkCache.set(cacheKey, EMPTY_LIMITS);
    return EMPTY_LIMITS;
  }
}

export function clearDisciplinariChunkLimitsCache(): void {
  chunkCache.clear();
}
