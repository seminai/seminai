import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DosageAgentContext, hasContext } from '../../services/agents/dosage_agent/context';
import { Label } from '../../../domain/dtos/label.dto';
import { DosageLoggerService } from '../dosage-logger.service';
import { buildSectionChunks, estimateTokens, mergePartialLabels, splitTextIntoChunks, splitTextIntoSections } from './extractDataFromLabel.part-01-estimate-tokens';
import { extractSingleChunk } from './extractDataFromLabel.part-03-extract-single-chunk';

export async function extractStructuredTreatmentData(
  text: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const inputText = text || '';
  const estimatedTokens = estimateTokens(inputText);
  const maxSafeTokensForMultiChunk = 60000;
  const maxSafeTokensForSingleChunk = 7500;
  const maxChunkSize = 10000;
  const chunkOverlap = 2000;
  const useGpt4oThreshold = 5000;
  const sectionSplitTokenThreshold = 4000;
  const sectionChunkCharLimit = 12000;
  const inputMessage = `Input: ${inputText.length} chars (~${estimatedTokens} tokens estimated)`;
  console.log(`[LABEL_EXTRACTION] ${inputMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: inputMessage,
      metadata: { chars: inputText.length, estimatedTokens },
    });
  }

  if (estimatedTokens <= maxSafeTokensForSingleChunk) {
    if (estimatedTokens > sectionSplitTokenThreshold) {
      const sectionMessage = `Single chunk would be large (${estimatedTokens} tokens). Splitting by sections for safer extraction.`;
      console.log(`[LABEL_EXTRACTION] ${sectionMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logLabelExtraction({
          jobId: context.jobId,
          userId: context.userId,
          message: sectionMessage,
          metadata: { estimatedTokens },
        });
      }

      return await extractBySections(inputText, sectionChunkCharLimit, callbacks, context);
    }
    const modelToUse = estimatedTokens >= useGpt4oThreshold ? 'gpt-4o' : 'gpt-4o-mini';
    const singleChunkMessage = `Single chunk processing with ${modelToUse} (within ${maxSafeTokensForSingleChunk} token safe limit)`;
    console.log(`[LABEL_EXTRACTION] ${singleChunkMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: singleChunkMessage,
        metadata: { model: modelToUse, estimatedTokens },
      });
    }

    return await extractSingleChunk(inputText, modelToUse, callbacks, context);
  }
  if (estimatedTokens > maxSafeTokensForMultiChunk) {
    const errorMessage = `Text too long (${estimatedTokens} tokens > ${maxSafeTokensForMultiChunk}). Consider processing smaller documents.`;
    console.error(`[LABEL_EXTRACTION] ${errorMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logError({
        jobId: context.jobId,
        userId: context.userId,
        message: errorMessage,
        metadata: { estimatedTokens, maxSafeTokensForMultiChunk },
      });
    }
  }
  const chunks = splitTextIntoChunks(inputText, maxChunkSize, chunkOverlap);
  const chunksMessage = `Split into ${chunks.length} chunks for PARALLEL processing with gpt-4o (complex extraction)`;
  console.log(`[LABEL_EXTRACTION] ${chunksMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: chunksMessage,
      metadata: { chunksCount: chunks.length, model: 'gpt-4o' },
    });
  }

  const startTime = Date.now();
  const partialLabels: Label[] = await Promise.all(
    chunks.map((chunk, index) => {
      const chunkMessage = `Starting chunk ${index + 1}/${chunks.length} with gpt-4o`;
      console.log(`[LABEL_EXTRACTION] ${chunkMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logLabelExtraction({
          jobId: context.jobId,
          userId: context.userId,
          message: chunkMessage,
          metadata: { chunkIndex: index + 1, totalChunks: chunks.length },
        });
      }

      return extractSingleChunk(chunk, 'gpt-4o', callbacks, context);
    }),
  );
  const extractionTime = Date.now() - startTime;
  const extractedMessage = `Extracted ${partialLabels.length} chunks in ${extractionTime}ms (parallel)`;
  console.log(`[LABEL_EXTRACTION] ${extractedMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: extractedMessage,
      metadata: { chunksCount: partialLabels.length, duration: extractionTime },
    });
  }

  return await mergePartialLabels(partialLabels, callbacks, context);
}

export async function extractBySections(
  text: string,
  sectionCharLimit: number,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const sections = splitTextIntoSections(text);
  const chunks = buildSectionChunks(sections, sectionCharLimit);
  const sectionsMessage = `Split document into ${sections.length} sections -> ${chunks.length} logical chunks`;
  console.log(`[LABEL_EXTRACTION] ${sectionsMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: sectionsMessage,
      metadata: { sectionsCount: sections.length, chunksCount: chunks.length },
    });
  }

  const partialLabels: Label[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkMessage = `Extracting logical chunk ${i + 1}/${chunks.length} with gpt-4o`;
    console.log(`[LABEL_EXTRACTION] ${chunkMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: chunkMessage,
        metadata: { chunkIndex: i + 1, totalChunks: chunks.length },
      });
    }

    const label = await extractSingleChunk(chunks[i], 'gpt-4o', callbacks, context);
    partialLabels.push(label);
  }
  return await mergePartialLabels(partialLabels, callbacks, context);
}
