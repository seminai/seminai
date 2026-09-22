import { createHash } from 'node:crypto';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AgronomistAdviceDto } from '../../../../domain/dtos/weather/agronomist-advice.dto';
import type { IWeatherAdvisorCacheRepository } from '../../../../domain/repositories/IWeatherAdvisorCacheRepository';
import { DEFAULT_TREATMENT_THRESHOLDS } from '../../../../domain/services/treatment-weather/thresholds';
import { callWithFallback } from '../dosage_agent/llmProvider';
import { AgronomistAdviceSchema, type AgronomistAdviceJson } from './agronomist-advice.schema';
import {
  buildAgronomistPrompt,
  type MachineSummary,
  type ProductSummary,
} from './prompts/agronomist-system-prompt';

export interface AdviseForInput {
  readonly products: readonly ProductSummary[];
  readonly machine?: MachineSummary;
  readonly userId?: string;
  readonly jobId?: string;
}

type LlmCaller = (
  prompt: string,
  operation: 'weather-advisor',
) => Promise<{ json: AgronomistAdviceJson; sourceModel: string }>;

interface WeatherAdvisorOptions {
  readonly cacheRepo: IWeatherAdvisorCacheRepository;
  readonly llmCaller?: LlmCaller;
}

/**
 * Sub-agent that decides weather thresholds for a treatment based on the
 * products + machine context. Cache-first: identical contexts reuse the
 * advice persisted in `WeatherAdvisorCache`. On LLM failure, falls back to
 * `DEFAULT_TREATMENT_THRESHOLDS` and surfaces a warning so the consumer can
 * communicate to the user that the answer is generic.
 */
export class WeatherAdvisorService {
  private readonly cacheRepo: IWeatherAdvisorCacheRepository;
  private readonly llmCaller: LlmCaller;

  constructor(options: WeatherAdvisorOptions) {
    this.cacheRepo = options.cacheRepo;
    this.llmCaller = options.llmCaller ?? defaultLlmCaller;
  }

  async adviseFor(input: AdviseForInput): Promise<AgronomistAdviceDto> {
    const contextHash = computeContextHash(input);
    const cached = await this.cacheRepo.findByContextHash(contextHash);
    if (cached) {
      return {
        thresholds: cached.thresholds,
        source: 'cache',
        reasoning: cached.reasoning ?? undefined,
        confidence: cached.confidence,
        warnings: [],
        contextHash: cached.contextHash,
        sourceModel: cached.sourceModel,
      };
    }
    try {
      const prompt = buildAgronomistPrompt(input);
      const { json, sourceModel } = await this.llmCaller(prompt, 'weather-advisor');
      await this.cacheRepo.save({
        contextHash,
        thresholds: json.thresholds,
        reasoning: json.reasoning,
        confidence: json.confidence,
        sourceModel,
      });
      return {
        thresholds: json.thresholds,
        source: 'agronomist-llm',
        reasoning: json.reasoning,
        confidence: json.confidence,
        warnings: [],
        contextHash,
        sourceModel,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      return {
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        source: 'default-fallback',
        warnings: [`Agronomist LLM unavailable, using conservative defaults. Reason: ${reason}`],
        contextHash,
      };
    }
  }
}

export function computeContextHash(input: AdviseForInput): string {
  const canonicalProducts = [...input.products]
    .map((p) => ({
      sku: p.sku,
      category: p.category,
      type: p.type ?? null,
      labelCategoria: p.labelCategoria ?? null,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
  const canonicalMachine = input.machine
    ? {
        name: input.machine.name,
        identifier: input.machine.identifier ?? null,
      }
    : null;
  const canonical = JSON.stringify({
    products: canonicalProducts,
    machine: canonicalMachine,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

const defaultLlmCaller: LlmCaller = async (prompt, operation) => {
  const callResult = await callWithFallback({
    operation,
    modelOptions: { temperature: 0 },
    execute: async (model: BaseChatModel) => {
      const response = await model.invoke(prompt);
      const content = extractText(response.content);
      const json = parseAgronomistJson(content);
      return json;
    },
  });
  return { json: callResult.result, sourceModel: callResult.usedModel };
};

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === 'string'
          ? c
          : typeof c === 'object' && c !== null && 'text' in c
            ? String((c as { text: unknown }).text)
            : '',
      )
      .join('');
  }
  return '';
}

function parseAgronomistJson(raw: string): AgronomistAdviceJson {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) throw new Error('No JSON found in Agronomist LLM response');
  let depth = 0;
  let lastBrace = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
  }
  if (lastBrace === -1) throw new Error('Unbalanced JSON in Agronomist LLM response');
  const json = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
  return AgronomistAdviceSchema.parse(json);
}
