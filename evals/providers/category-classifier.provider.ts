/**
 * Promptfoo provider for P1 CategoryClassifierService.
 * Invokes the real production classifier with LLM enabled.
 */
import 'dotenv/config';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';
import { CategoryClassifierService } from '../../backend/src/infrastructure/services/extraction/category-classifier.service';

function requireLlmKey(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for category-classifier eval.');
  }
}

function buildFileBuffer(vars: Record<string, string>): Buffer {
  if (vars.preset === 'zip-shapefile') {
    return Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  }
  const encoding = vars.fileEncoding ?? 'utf8';
  const content = vars.fileContent ?? '';
  if (encoding === 'base64') {
    return Buffer.from(content, 'base64');
  }
  if (encoding === 'hex') {
    return Buffer.from(content, 'hex');
  }
  return Buffer.from(content, 'utf8');
}

export default class CategoryClassifierProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly classifier: CategoryClassifierService;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'category-classifier';
    requireLlmKey();
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = 'true';
    this.classifier = new CategoryClassifierService();
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = (context?.vars ?? {}) as Record<string, string>;
    const mimeType = vars.mimeType ?? 'application/octet-stream';
    const fileName = vars.fileName ?? 'unknown.bin';
    const pdfText = vars.pdfText || undefined;

    try {
      const result = await this.classifier.classifyAuto({
        fileBuffer: buildFileBuffer(vars),
        mimeType,
        fileName,
        pdfText,
      });
      return {
        output: JSON.stringify({
          category: result.category,
          source: result.source,
          confidence: result.confidence,
          reason: result.reason,
          detectionType: result.detection?.type ?? null,
        }),
      };
    } catch (err) {
      return { error: `CategoryClassifierProvider error: ${(err as Error).message}` };
    }
  }
}
