/**
 * Promptfoo provider for P1 crop-catalog-resolver.
 * Calls resolveUnresolvedCropsWithLlm with real OpenAI structured output.
 */
import 'dotenv/config';
import { z } from 'zod';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';
import { resolveUnresolvedCropsWithLlm } from '../../backend/src/infrastructure/services/extraction/crop-catalog-resolver';
import { getCropCatalog } from '../../backend/src/infrastructure/services/extraction/production-unit-normalizer';
import { createChatModel } from '../../backend/src/infrastructure/services/llm-model-factory';

const BatchCropIdentificationSchema = z.object({
  crops: z.array(
    z.object({
      input: z.string(),
      species: z.string(),
      cropType: z.string(),
      code: z.string().nullable(),
      variety: z.string().nullable(),
    }),
  ),
});

function requireLlmKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for crop-catalog-resolver eval.');
  }
}

export default class CropCatalogResolverProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'crop-catalog-resolver';
    this.model = (options.config?.model as string) ?? 'gpt-4o-mini';
    requireLlmKey();
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = (context?.vars ?? {}) as Record<string, string>;
    const cropName = vars.cropName;
    if (!cropName) {
      return { error: 'cropName var is required' };
    }
    const variety = vars.variety?.trim() ? vars.variety : null;

    try {
      const catalog = getCropCatalog();
      const { model: llm } = createChatModel({
        modelName: this.model,
        temperature: 0,
        maxTokens: 500,
        timeout: 30_000,
      });
      const extractor = llm.withStructuredOutput(BatchCropIdentificationSchema);
      const resolved = await resolveUnresolvedCropsWithLlm({
        inputs: [{ cropName, variety }],
        catalog,
        invokeBatch: (messages) => extractor.invoke([...messages]),
      });
      const identification = resolved[0]?.identification;
      if (!identification) {
        return {
          output: JSON.stringify({
            species: null,
            cropType: null,
            code: null,
            variety: null,
            skipped: true,
          }),
        };
      }
      return {
        output: JSON.stringify({
          species: identification.species,
          cropType: identification.cropType,
          code: identification.code,
          variety: identification.variety,
          skipped: false,
        }),
      };
    } catch (err) {
      return { error: `CropCatalogResolverProvider error: ${(err as Error).message}` };
    }
  }
}
