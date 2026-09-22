import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';
import { DetectionConfidence, ClassificationSource, LlmCategoryOutput, AutoClassificationInput, CategoryClassificationResult, ClassifierOptions } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';
import { categoryClassifierServiceClassifyAuto } from './category-classifier-service.01-classify-auto';
import { categoryClassifierServiceDetectFromRules } from './category-classifier-service.02-detect-from-rules';
import { categoryClassifierServiceGetFileNameRule } from './category-classifier-service.03-get-file-name-rule';
import { categoryClassifierServiceGetHighConfidenceRule } from './category-classifier-service.04-get-high-confidence-rule';
import { categoryClassifierServiceResolveRuleFallback } from './category-classifier-service.05-resolve-rule-fallback';
import { categoryClassifierServiceMapPdfDetectionToCategory } from './category-classifier-service.06-map-pdf-detection-to-category';
import { categoryClassifierServiceAsCategoryResult } from './category-classifier-service.07-as-category-result';
import { categoryClassifierServiceCallLlm } from './category-classifier-service.08-call-llm';
import { categoryClassifierServiceBuildPrompt } from './category-classifier-service.09-build-prompt';
import { categoryClassifierServiceBuildPreview } from './category-classifier-service.10-build-preview';
import { categoryClassifierServiceParseJsonOutput } from './category-classifier-service.11-parse-json-output';
import { categoryClassifierServiceApplyGuardrails } from './category-classifier-service.12-apply-guardrails';
import { categoryClassifierServiceMergeAsHybridFallback } from './category-classifier-service.13-merge-as-hybrid-fallback';
import { categoryClassifierServiceBuildCacheKey } from './category-classifier-service.14-build-cache-key';
import { categoryClassifierServiceGetCached } from './category-classifier-service.15-get-cached';
import { categoryClassifierServiceSetCached } from './category-classifier-service.16-set-cached';
import { categoryClassifierServiceToBucket } from './category-classifier-service.17-to-bucket';
import { categoryClassifierServiceFromBucket } from './category-classifier-service.18-from-bucket';
import { categoryClassifierServiceIsLlmEnabled } from './category-classifier-service.19-is-llm-enabled';

export { type CategoryClassificationResult } from './category-classifier.service.support';

export class CategoryClassifierService {

  constructor(readonly options: ClassifierOptions = {}) {}

  async classifyAuto(input: AutoClassificationInput): Promise<CategoryClassificationResult> {
    return categoryClassifierServiceClassifyAuto.call(this as unknown as CategoryClassifierServiceContext, input);
  }

  detectFromRules(
    fileFormat: FileFormat,
    fileBuffer: Buffer,
    pdfText?: string,
  ): FileDetectionResult | undefined {
    return categoryClassifierServiceDetectFromRules.call(this as unknown as CategoryClassifierServiceContext, fileFormat, fileBuffer, pdfText);
  }

  getFileNameRule(
    fileFormat: FileFormat,
    fileName: string,
  ): Omit<CategoryClassificationResult, 'fromCache'> | null {
    return categoryClassifierServiceGetFileNameRule.call(this as unknown as CategoryClassifierServiceContext, fileFormat, fileName);
  }

  getHighConfidenceRule(
    fileFormat: FileFormat,
    detection?: FileDetectionResult,
  ): Omit<CategoryClassificationResult, 'fromCache'> | null {
    return categoryClassifierServiceGetHighConfidenceRule.call(this as unknown as CategoryClassifierServiceContext, fileFormat, detection);
  }

  resolveRuleFallback(
    fileFormat: FileFormat,
    detection?: FileDetectionResult,
  ): Omit<CategoryClassificationResult, 'fromCache'> {
    return categoryClassifierServiceResolveRuleFallback.call(this as unknown as CategoryClassifierServiceContext, fileFormat, detection);
  }

  mapPdfDetectionToCategory(type: FileDetectionResult['type']): ResolvedCategory {
    return categoryClassifierServiceMapPdfDetectionToCategory.call(this as unknown as CategoryClassifierServiceContext, type);
  }

  asCategoryResult(
    category: ResolvedCategory,
    fileFormat: FileFormat,
  ): Pick<CategoryClassificationResult, 'category' | 'fileFormat' | 'isAsync'> {
    return categoryClassifierServiceAsCategoryResult.call(this as unknown as CategoryClassifierServiceContext, category, fileFormat);
  }

  async callLlm(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): Promise<LlmCategoryOutput> {
    return categoryClassifierServiceCallLlm.call(this as unknown as CategoryClassifierServiceContext, input);
  }

  buildPrompt(input: {
    fileName: string;
    mimeType: string;
    fileFormat: FileFormat;
    detection?: FileDetectionResult;
    pdfText?: string;
  }): string {
    return categoryClassifierServiceBuildPrompt.call(this as unknown as CategoryClassifierServiceContext, input);
  }

  buildPreview(fileFormat: FileFormat, pdfText?: string): string {
    return categoryClassifierServiceBuildPreview.call(this as unknown as CategoryClassifierServiceContext, fileFormat, pdfText);
  }

  parseJsonOutput(content: string): LlmCategoryOutput | null {
    return categoryClassifierServiceParseJsonOutput.call(this as unknown as CategoryClassifierServiceContext, content);
  }

  applyGuardrails(
    fileFormat: FileFormat,
    llm: LlmCategoryOutput,
    detection?: FileDetectionResult,
  ): {
    category: ResolvedCategory;
    confidence: number;
    reason: string;
    source: ClassificationSource;
  } {
    return categoryClassifierServiceApplyGuardrails.call(this as unknown as CategoryClassifierServiceContext, fileFormat, llm, detection);
  }

  mergeAsHybridFallback(
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
    return categoryClassifierServiceMergeAsHybridFallback.call(this as unknown as CategoryClassifierServiceContext, guarded, fileFormat, detection);
  }

  buildCacheKey(
    fileBuffer: Buffer,
    mimeType: string,
    fileName: string,
    pdfText?: string,
  ): string {
    return categoryClassifierServiceBuildCacheKey.call(this as unknown as CategoryClassifierServiceContext, fileBuffer, mimeType, fileName, pdfText);
  }

  getCached(key: string): CategoryClassificationResult | null {
    return categoryClassifierServiceGetCached.call(this as unknown as CategoryClassifierServiceContext, key);
  }

  setCached(key: string, value: CategoryClassificationResult): void {
    categoryClassifierServiceSetCached.call(this as unknown as CategoryClassifierServiceContext, key, value);
  }

  toBucket(confidence: number): DetectionConfidence {
    return categoryClassifierServiceToBucket.call(this as unknown as CategoryClassifierServiceContext, confidence);
  }

  fromBucket(confidence: DetectionConfidence): number {
    return categoryClassifierServiceFromBucket.call(this as unknown as CategoryClassifierServiceContext, confidence);
  }

  isLlmEnabled(): boolean {
    return categoryClassifierServiceIsLlmEnabled.call(this as unknown as CategoryClassifierServiceContext);
  }
}

export const categoryClassifierService = new CategoryClassifierService();
