/**
 * Promptfoo provider for P1 disciplinari-chunk-limits-extractor.
 * Invokes extractDisciplinariChunkLimits with real LLM (no mock invoker).
 */
import 'dotenv/config';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';
import {
  clearDisciplinariChunkLimitsCache,
  extractDisciplinariChunkLimits,
  type DisciplinariLimitsKind,
} from '../../backend/src/infrastructure/services/agents/dosage_agent/disciplinari-chunk-limits-extractor';

function requireLlmKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for disciplinari-limits eval.');
  }
}

export default class DisciplinariLimitsProvider implements ApiProvider {
  private readonly providerId: string;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'disciplinari-limits';
    requireLlmKey();
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = (context?.vars ?? {}) as Record<string, string>;
    const text = vars.text;
    const kind = (vars.kind ?? 'applications') as DisciplinariLimitsKind;
    if (!text) {
      return { error: 'text var is required' };
    }

    clearDisciplinariChunkLimitsCache();

    try {
      const result = await extractDisciplinariChunkLimits({
        text,
        kind,
        context: {
          productName: vars.productName ?? 'Unknown product',
          cropName: vars.cropName ?? 'Vite',
          variety: vars.variety || undefined,
          epoca: vars.epoca || undefined,
          region: vars.region || undefined,
        },
      });
      return { output: JSON.stringify(result) };
    } catch (err) {
      return { error: `DisciplinariLimitsProvider error: ${(err as Error).message}` };
    }
  }
}
