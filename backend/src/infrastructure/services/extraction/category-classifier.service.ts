import { createHash } from 'node:crypto';
import { createChatModel } from '../llm-model-factory';
import { hasChatLlmApiKey } from '../llm-config';
import {
  detectCsvExcelType,
  detectPdfType,
  detectZipType,
  detectGeoJsonType,
  type FileDetectionResult,
} from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { resolveFileFormat, type FileFormat } from './file-format-resolver';
import { isVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';

type DetectionConfidence = FileDetectionResult['confidence'];
type ClassificationSource = 'rule' | 'llm' | 'hybrid';

interface ClassificationCacheEntry {
  readonly expiresAt: number;
  readonly value: CategoryClassificationResult;
}

interface LlmCategoryOutput {
  readonly category: ResolvedCategory;
  readonly confidence: number;
  readonly reason: string;
}

interface AutoClassificationInput {
  readonly fileBuffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
  readonly pdfText?: string;
}

export interface CategoryClassificationResult {
  readonly category: ResolvedCategory;
  readonly fileFormat: FileFormat;
  readonly isAsync: boolean;
  readonly detection?: FileDetectionResult;
  readonly source: ClassificationSource;
  readonly confidence: DetectionConfidence;
  readonly reason: string;
  readonly fromCache: boolean;
}

interface ClassifierOptions {
  readonly llmInvoker?: (prompt: string) => Promise<LlmCategoryOutput>;
}

const CATEGORY_CACHE = new Map<string, ClassificationCacheEntry>();
const DEFAULT_MODEL_NAME = process.env.CATEGORY_CLASSIFIER_MODEL ?? 'gpt-4o-mini';
const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.CATEGORY_LLM_CONFIDENCE_THRESHOLD ?? 0.55);
const DEFAULT_CACHE_TTL_MS = Number(
  process.env.CATEGORY_CLASSIFIER_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000,
);
const LLM_PROMPT_VERSION = 'v1';

export class CategoryClassifierService {
  constructor(private readonly options: ClassifierOptions = {}) {}

  async classifyAuto(input: AutoClassificationInput): Promise<CategoryClassificationResult> {
    const fileFormat = resolveFileFormat(input.mimeType, input.fileName);
    const fileNameRule = this.getFileNameRule(fileFormat, input.fileName);
    if (fileNameRule) {
      return { ...fileNameRule, fromCache: false };
    }
    if (fileFormat === 'shapefile' && isVenetoPcgZip(input.fileBuffer)) {
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'Veneto PCG ZIP contains PARTICELLE_CONDOTTE and ATTRIBUTI_PCG',
        fromCache: false,
      };
    }
    const detection = this.detectFromRules(fileFormat, input.fileBuffer, input.pdfText);
    const highConfidenceRule = this.getHighConfidenceRule(fileFormat, detection);
    if (highConfidenceRule) {
      return { ...highConfidenceRule, fromCache: false };
    }
    if (!this.isLlmEnabled()) {
      return { ...this.resolveRuleFallback(fileFormat, detection), fromCache: false };
    }
    const cacheKey = this.buildCacheKey(
      input.fileBuffer,
      input.mimeType,
      input.fileName,
      input.pdfText,
    );
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }
    const startedAt = Date.now();
    try {
      const llmOutput = await this.callLlm({
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileFormat,
        detection,
        pdfText: input.pdfText,
      });
      const guarded = this.applyGuardrails(fileFormat, llmOutput, detection);
      const finalized =
        guarded.confidence >= DEFAULT_CONFIDENCE_THRESHOLD
          ? guarded
          : this.mergeAsHybridFallback(guarded, fileFormat, detection);
      const result: CategoryClassificationResult = {
        ...this.asCategoryResult(finalized.category, fileFormat),
        detection,
        source: finalized.source,
        confidence: this.toBucket(finalized.confidence),
        reason: finalized.reason,
        fromCache: false,
      };
      this.setCached(cacheKey, result);
      console.log(
        '[CATEGORY-CLASSIFIER]',
        JSON.stringify({
          source: result.source,
          fileFormat,
          category: result.category,
          confidence: result.confidence,
          latencyMs: Date.now() - startedAt,
          cached: false,
        }),
      );
      return result;
    } catch (error) {
      const fallback = this.resolveRuleFallback(fileFormat, detection);
      console.warn(
        '[CATEGORY-CLASSIFIER] LLM fallback',
        JSON.stringify({
          fileName: input.fileName,
          error: error instanceof Error ? error.message : String(error),
          category: fallback.category,
        }),
      );
      return { ...fallback, fromCache: false };
    }
  }

  private detectFromRules(
    fileFormat: FileFormat,
    fileBuffer: Buffer,
    pdfText?: string,
  ): FileDetectionResult | undefined {
    if (fileFormat === 'csv_excel') {
      return detectCsvExcelType(fileBuffer);
    }
    if (fileFormat === 'pdf' && pdfText) {
      return detectPdfType(pdfText);
    }
    if (fileFormat === 'shapefile') {
      return detectZipType(fileBuffer);
    }
    if (fileFormat === 'geojson') {
      return detectGeoJsonType(fileBuffer);
    }
    return undefined;
  }

  private getFileNameRule(
    fileFormat: FileFormat,
    fileName: string,
  ): Omit<CategoryClassificationResult, 'fromCache'> | null {
    const normalized = fileName.toLowerCase();
    if (fileFormat === 'geojson' || /^pcg_.*\.geojson$/i.test(normalized)) {
      return {
        ...this.asCategoryResult('agricultural', 'geojson'),
        source: 'rule',
        confidence: 'high',
        reason: 'PCG GeoJSON filename indicates agricultural crop plan',
      };
    }
    if (fileFormat !== 'pdf') return null;
    if (/\bddt\b|documento[-_\s]?di[-_\s]?trasporto/.test(normalized)) {
      return {
        ...this.asCategoryResult('ddt', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'PDF filename indicates DDT document',
      };
    }
    if (/fattur|invoice/.test(normalized)) {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'PDF filename indicates invoice document',
      };
    }
    return null;
  }

  private getHighConfidenceRule(
    fileFormat: FileFormat,
    detection?: FileDetectionResult,
  ): Omit<CategoryClassificationResult, 'fromCache'> | null {
    if (fileFormat === 'xml') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'XML is always mapped to invoice pipeline',
      };
    }
    if (fileFormat === 'image') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: 'Image is mapped to invoice OCR pipeline',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        ...this.asCategoryResult('fields', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection?.reason ?? 'ZIP shapefile detection',
        detection,
      };
    }
    if (fileFormat === 'geojson') {
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection?.reason ?? 'PCG GeoJSON detection',
        detection,
      };
    }
    if (fileFormat === 'csv_excel' && detection?.confidence === 'high') {
      return {
        ...this.asCategoryResult(
          detection.type === 'warehouse_stock' ? 'stock' : 'agricultural',
          fileFormat,
        ),
        source: 'rule',
        confidence: 'high',
        reason: detection.reason,
        detection,
      };
    }
    if (fileFormat === 'pdf' && detection && detection.confidence === 'high') {
      return {
        ...this.asCategoryResult(this.mapPdfDetectionToCategory(detection.type), fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: detection.reason,
        detection,
      };
    }
    return null;
  }

  private resolveRuleFallback(
    fileFormat: FileFormat,
    detection?: FileDetectionResult,
  ): Omit<CategoryClassificationResult, 'fromCache'> {
    if (fileFormat === 'csv_excel') {
      if (detection?.type === 'warehouse_stock') {
        return {
          ...this.asCategoryResult('stock', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'low',
        reason: detection?.reason ?? 'Default fallback to agricultural for csv/excel',
      };
    }
    if (fileFormat === 'pdf') {
      if (detection?.type === 'invoice') {
        return {
          ...this.asCategoryResult('invoice', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      if (detection?.type === 'ddt') {
        return {
          ...this.asCategoryResult('ddt', fileFormat),
          detection,
          source: 'rule',
          confidence: detection.confidence,
          reason: detection.reason,
        };
      }
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'low',
        reason: detection?.reason ?? 'Default fallback to agricultural for pdf',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        ...this.asCategoryResult('fields', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'high',
        reason: detection?.reason ?? 'ZIP shapefile fallback',
      };
    }
    if (fileFormat === 'geojson') {
      return {
        ...this.asCategoryResult('agricultural', fileFormat),
        detection,
        source: 'rule',
        confidence: detection?.confidence ?? 'high',
        reason: detection?.reason ?? 'PCG GeoJSON fallback',
      };
    }
    if (fileFormat === 'xml' || fileFormat === 'image') {
      return {
        ...this.asCategoryResult('invoice', fileFormat),
        source: 'rule',
        confidence: 'high',
        reason: `${fileFormat} mapped to invoice`,
      };
    }
    return {
      ...this.asCategoryResult('agricultural', fileFormat),
      source: 'rule',
      confidence: 'low',
      reason: 'Unknown format fallback',
    };
  }

  private mapPdfDetectionToCategory(type: FileDetectionResult['type']): ResolvedCategory {
    if (type === 'invoice') return 'invoice';
    if (type === 'ddt') return 'ddt';
    return 'agricultural';
  }

  private asCategoryResult(
    category: ResolvedCategory,
    fileFormat: FileFormat,
  ): Pick<CategoryClassificationResult, 'category' | 'fileFormat' | 'isAsync'> {
    const isAsync = fileFormat === 'pdf' && category === 'agricultural';
    return { category, fileFormat, isAsync };
  }

  private async callLlm(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): Promise<LlmCategoryOutput> {
    if (this.options.llmInvoker) {
      return this.options.llmInvoker(this.buildPrompt(input));
    }
    const { model: llm } = createChatModel({
      modelName: DEFAULT_MODEL_NAME,
      temperature: 0,
      maxTokens: 150,
      timeout: Number(process.env.CATEGORY_CLASSIFIER_TIMEOUT_MS ?? 4000),
    });
    const rawResponse = await llm.invoke(this.buildPrompt(input));
    const content = Array.isArray(rawResponse.content)
      ? rawResponse.content.map((part) => ('text' in part ? part.text : '')).join('\n')
      : String(rawResponse.content ?? '');
    const parsed = this.parseJsonOutput(content);
    if (!parsed) {
      throw new Error('LLM output is not a valid JSON classification');
    }
    return parsed;
  }

  private buildPrompt(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): string {
    const preview = this.buildPreview(input.fileFormat, input.pdfText);
    return `You classify business documents for extraction routing.
Return ONLY JSON with this shape:
{"category":"fields|production_units|agricultural|invoice|ddt|stock","confidence":0.0,"reason":"short explanation"}

Rules:
- Prefer lowest-latency conservative routing.
- If uncertain between fields/production_units, return agricultural.
- XML and images should usually be invoice.
- DDT requires transport-document clues.

Input:
- fileName: ${input.fileName}
- mimeType: ${input.mimeType}
- fileFormat: ${input.fileFormat}
- ruleDetectionType: ${input.detection?.type ?? 'none'}
- ruleDetectionConfidence: ${input.detection?.confidence ?? 'none'}
- ruleDetectionReason: ${input.detection?.reason ?? 'none'}
- contentPreview: ${preview}`;
  }

  private buildPreview(fileFormat: FileFormat, pdfText?: string): string {
    if (fileFormat !== 'pdf' || !pdfText) return 'n/a';
    return pdfText.replace(/\s+/g, ' ').trim().slice(0, 1400);
  }

  private parseJsonOutput(content: string): LlmCategoryOutput | null {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as {
      category?: string;
      confidence?: number;
      reason?: string;
    };
    const allowed = new Set<ResolvedCategory>([
      'fields',
      'production_units',
      'agricultural',
      'invoice',
      'ddt',
      'stock',
    ]);
    if (!parsed.category || !allowed.has(parsed.category as ResolvedCategory)) {
      return null;
    }
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    return {
      category: parsed.category as ResolvedCategory,
      confidence,
      reason: parsed.reason?.slice(0, 220) ?? 'No reason provided',
    };
  }

  private applyGuardrails(
    fileFormat: FileFormat,
    llm: LlmCategoryOutput,
    detection?: FileDetectionResult,
  ): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  } {
    if (fileFormat === 'xml' || fileFormat === 'image') {
      return {
        category: 'invoice',
        confidence: 1,
        reason: `Guardrail forced invoice for ${fileFormat}`,
        source: 'hybrid',
      };
    }
    if (fileFormat === 'shapefile') {
      return {
        category: 'fields',
        confidence: 1,
        reason: 'Guardrail forced fields for shapefile zip',
        source: 'hybrid',
      };
    }
    if (fileFormat === 'geojson') {
      return {
        category: 'agricultural',
        confidence: 1,
        reason: 'Guardrail forced agricultural for PCG GeoJSON',
        source: 'hybrid',
      };
    }
    if (fileFormat === 'csv_excel' && (llm.category === 'invoice' || llm.category === 'ddt')) {
      return {
        category: detection?.type === 'warehouse_stock' ? 'stock' : 'agricultural',
        confidence: 0.45,
        reason: 'Guardrail rejected invoice/ddt for csv_excel',
        source: 'hybrid',
      };
    }
    return {
      category: llm.category,
      confidence: llm.confidence,
      reason: llm.reason,
      source: 'llm',
    };
  }

  private mergeAsHybridFallback(
    guarded: {
      category: ResolvedCategory;
      confidence: number;
      reason: string;
      source: ClassificationSource;
    },
    fileFormat: FileFormat,
    detection?: FileDetectionResult,
  ): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  } {
    const fallback = this.resolveRuleFallback(fileFormat, detection);
    return {
      category: fallback.category,
      confidence: this.fromBucket(fallback.confidence),
      reason: `LLM low confidence (${guarded.confidence.toFixed(2)}), fallback: ${fallback.reason}`,
      source: 'hybrid',
    };
  }

  private buildCacheKey(
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
    pdfText?: string,
  ): string {
    const digest = createHash('sha256').update(new Uint8Array(fileBuffer)).digest('hex');
    const pdfDigest = pdfText
      ? createHash('sha1').update(pdfText.slice(0, 2000)).digest('hex')
      : 'no-text';
    return `${LLM_PROMPT_VERSION}:${digest}:${mimeType}:${fileName.toLowerCase()}:${pdfDigest}`;
  }

  private getCached(key: string): CategoryClassificationResult | null {
    const cached = CATEGORY_CACHE.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      CATEGORY_CACHE.delete(key);
      return null;
    }
    return { ...cached.value, fromCache: true };
  }

  private setCached(key: string, value: CategoryClassificationResult): void {
    CATEGORY_CACHE.set(key, { value, expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS });
  }

  private toBucket(confidence: number): DetectionConfidence {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  private fromBucket(confidence: DetectionConfidence): number {
    if (confidence === 'high') return 0.9;
    if (confidence === 'medium') return 0.6;
    return 0.3;
  }

  private isLlmEnabled(): boolean {
    if (process.env.LLM_CATEGORY_CLASSIFIER_ENABLED === 'false') return false;
    return hasChatLlmApiKey();
  }
}

export const categoryClassifierService = new CategoryClassifierService();
