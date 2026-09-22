import { type FileDetectionResult } from '../agents/dosage_agent_react/tools/file-type-detector';
import { type ResolvedCategory } from '../../../domain/dtos/file-extraction.dto';
import { type FileFormat } from './file-format-resolver';


export type DetectionConfidence = FileDetectionResult['confidence'];

export type ClassificationSource = 'rule' | 'llm' | 'hybrid';


export interface ClassificationCacheEntry {
  readonly expiresAt: number;
  readonly value: CategoryClassificationResult;
}


export interface LlmCategoryOutput {
  readonly category: ResolvedCategory;
  readonly confidence: number;
  readonly reason: string;
}


export interface AutoClassificationInput {
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


export interface ClassifierOptions {
  readonly llmInvoker?: (prompt: string) => Promise<LlmCategoryOutput>;
}


export const CATEGORY_CACHE = new Map<string, ClassificationCacheEntry>();

export const DEFAULT_MODEL_NAME = process.env.CATEGORY_CLASSIFIER_MODEL ?? 'gpt-4o-mini';

export const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.CATEGORY_LLM_CONFIDENCE_THRESHOLD ?? 0.55);

export const DEFAULT_CACHE_TTL_MS = Number(
  process.env.CATEGORY_CLASSIFIER_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000,
);

export const LLM_PROMPT_VERSION = 'v1';
