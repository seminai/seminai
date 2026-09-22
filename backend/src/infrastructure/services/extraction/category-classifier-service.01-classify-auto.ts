import { resolveFileFormat } from './file-format-resolver';
import { isVenetoPcgZip } from './veneto-pcg/veneto-pcg-zip-parser';
import { AutoClassificationInput, CategoryClassificationResult, DEFAULT_CONFIDENCE_THRESHOLD } from './category-classifier.service.support';
import type { CategoryClassifierServiceContext } from './category-classifier-service.context';

export async function categoryClassifierServiceClassifyAuto(this: CategoryClassifierServiceContext, input: AutoClassificationInput): Promise<CategoryClassificationResult> {
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
