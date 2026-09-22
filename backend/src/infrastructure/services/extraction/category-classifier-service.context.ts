import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';
import { DetectionConfidence, ClassificationSource, LlmCategoryOutput, AutoClassificationInput, CategoryClassificationResult, ClassifierOptions } from './category-classifier.service.support';

export interface CategoryClassifierServiceContext {
  readonly options: ClassifierOptions;
  classifyAuto(input: AutoClassificationInput): Promise<CategoryClassificationResult>;
  detectFromRules(fileFormat: FileFormat, fileBuffer: Buffer, pdfText?: string): FileDetectionResult | undefined;
  getFileNameRule(fileFormat: FileFormat, fileName: string): Omit<CategoryClassificationResult, 'fromCache'> | null;
  getHighConfidenceRule(fileFormat: FileFormat, detection?: FileDetectionResult): Omit<CategoryClassificationResult, 'fromCache'> | null;
  resolveRuleFallback(fileFormat: FileFormat, detection?: FileDetectionResult): Omit<CategoryClassificationResult, 'fromCache'>;
  mapPdfDetectionToCategory(type: FileDetectionResult['type']): ResolvedCategory;
  asCategoryResult(category: ResolvedCategory, fileFormat: FileFormat): Pick<CategoryClassificationResult, 'category' | 'fileFormat' | 'isAsync'>;
  callLlm(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): Promise<LlmCategoryOutput>;
  buildPrompt(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): string;
  buildPreview(fileFormat: FileFormat, pdfText?: string): string;
  parseJsonOutput(content: string): LlmCategoryOutput | null;
  applyGuardrails(fileFormat: FileFormat, llm: LlmCategoryOutput, detection?: FileDetectionResult): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  };
  mergeAsHybridFallback(guarded: {
      category: ResolvedCategory;
      confidence: number;
      reason: string;
      source: ClassificationSource;
    }, fileFormat: FileFormat, detection?: FileDetectionResult): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  };
  buildCacheKey(fileBuffer: Buffer, mimeType: string, fileName: string, pdfText?: string): string;
  getCached(key: string): CategoryClassificationResult | null;
  setCached(key: string, value: CategoryClassificationResult): void;
  toBucket(confidence: number): DetectionConfidence;
  fromBucket(confidence: DetectionConfidence): number;
  isLlmEnabled(): boolean;
}
