import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { createChatModel } from '../llm-model-factory';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { LlmJobType } from '@prisma/client';
import { DisciplinariExtractedData } from '../../../domain/dtos/disciplinari.dto';
import { DisciplinariExtractionContext, PartialDisciplinariExtraction, estimateTokens, splitTextIntoChunks, usageLogger } from './extractDataFromDisciplinari.part-01-usage-logger';
import { EXTRACTION_PROMPT } from './extractDataFromDisciplinari.part-02-extraction-prompt';
import { createEmptyExtraction, sanitizeDisciplinariExtraction } from './extractDataFromDisciplinari.part-04-create-empty-extraction';

/**
 * Extracts structured data from a single text chunk.
 */
export async function extractSingleChunk(
  text: string,
  chunkIndex: number,
  totalChunks: number,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<PartialDisciplinariExtraction> {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
  const estimatedTokens = estimateTokens(text);
  const MAX_SAFE_TOKENS = 50000; // Safety limit per chunk

  console.log(
    `[DISCIPLINARI_EXTRACTION] Processing chunk ${chunkIndex + 1}/${totalChunks} with model: ${modelName}, estimated tokens: ${estimatedTokens}`,
  );

  // Safety check: if chunk is still too large, split it further
  if (estimatedTokens > MAX_SAFE_TOKENS) {
    console.warn(
      `[DISCIPLINARI_EXTRACTION] Chunk ${chunkIndex + 1} is too large (${estimatedTokens} tokens), splitting further...`,
    );
    const subChunks = splitTextIntoChunks(text, MAX_SAFE_TOKENS * 3.5, MAX_SAFE_TOKENS * 1.5);
    const subPartials: PartialDisciplinariExtraction[] = [];
    for (let i = 0; i < subChunks.length; i++) {
      const subPartial = await extractSingleChunk(
        subChunks[i],
        chunkIndex,
        totalChunks,
        callbacks,
        context,
      );
      subPartials.push(subPartial);
    }
    // Merge sub-partials manually
    if (subPartials.length === 0) {
      return {
        documentMetadata: null,
        scopeEntities: [],
        rules: null,
        defenseTargets: [],
        extractionConfidence: 0,
        extractionErrors: [`Chunk ${chunkIndex + 1} was split but no results obtained`],
      };
    }
    if (subPartials.length === 1) {
      return subPartials[0];
    }
    // Simple merge: combine all arrays, use first non-null metadata
    const merged: PartialDisciplinariExtraction = {
      documentMetadata:
        subPartials.find((p) => p.documentMetadata !== null)?.documentMetadata ?? null,
      scopeEntities: subPartials.flatMap((p) => p.scopeEntities),
      rules: subPartials.find((p) => p.rules !== null)?.rules ?? null,
      defenseTargets: subPartials.flatMap((p) => p.defenseTargets),
      extractionConfidence: Math.round(
        subPartials.reduce((sum, p) => sum + p.extractionConfidence, 0) / subPartials.length,
      ),
      extractionErrors: subPartials.flatMap((p) => p.extractionErrors),
    };
    return merged;
  }

  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
    maxTokens: 16000,
  });

  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<PartialDisciplinariExtraction>();

  const prompt = PromptTemplate.fromTemplate(EXTRACTION_PROMPT);
  const chain = prompt.pipe(llm).pipe(parser);

  try {
    const result = await chain.invoke(
      {
        text,
        format_instructions: parser.getFormatInstructions(),
      },
      { callbacks: tracker.callbacks },
    );

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: LlmJobType.LABEL,
      model: resolvedModelName,
      metadata: { step: 'disciplinari-chunk-extraction', chunkIndex, totalChunks },
    });

    return result;
  } catch (error) {
    console.error(`[DISCIPLINARI_EXTRACTION] Error extracting chunk ${chunkIndex + 1}:`, error);
    return {
      documentMetadata: null,
      scopeEntities: [],
      rules: null,
      defenseTargets: [],
      extractionConfidence: 0,
      extractionErrors: [
        `Chunk ${chunkIndex + 1} extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Merges multiple partial extractions into a single coherent result.
 */
export async function mergePartialExtractions(
  partials: PartialDisciplinariExtraction[],
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<DisciplinariExtractedData> {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
  console.log(
    `[DISCIPLINARI_EXTRACTION] Merging ${partials.length} partial extractions with model: ${modelName}`,
  );

  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
    maxTokens: 16000,
  });

  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<DisciplinariExtractedData>();

  const mergePrompt = PromptTemplate.fromTemplate(`
Sei un esperto di data integration. Ti vengono forniti più oggetti JSON parziali estratti da diverse sezioni dello stesso disciplinare.
Il tuo compito è unire questi oggetti in un UNICO oggetto coerente.

REGOLE DI MERGE:
- documentMetadata: usa i valori non-null più completi, preferisci date specifiche
- scopeEntities: unisci eliminando duplicati basati su crop.name + section.name
- rules: unisci tutti gli array eliminando stringhe duplicate
- defenseTargets: unisci per target.name, aggregando gli interventions di target con stesso nome
- interventions: unisci eliminando duplicati basati su productOrActive.name + dose
- extractionConfidence: usa la media dei valori
- extractionErrors: unisci tutti gli errori

VALIDAZIONE DATE:
- Se validUntil < oggi, imposta isExpired = true
- Se manca validUntil ma c'è year, calcola validUntil = year-12-31

NORMALIZZAZIONE:
- Assicurati che tutti i campi required abbiano valori validi
- Imposta valori di default dove mancanti (array vuoti, null per opzionali)

OGGETTI PARZIALI DA UNIRE:
{partials}

{format_instructions}

Rispondi SOLO con il JSON unificato, senza testo aggiuntivo.
`);

  const chain = mergePrompt.pipe(llm).pipe(parser);

  try {
    const result = await chain.invoke(
      {
        partials: JSON.stringify(partials, null, 2),
        format_instructions: parser.getFormatInstructions(),
      },
      { callbacks: tracker.callbacks },
    );

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: LlmJobType.LABEL,
      model: resolvedModelName,
      metadata: { step: 'disciplinari-merge', partialsCount: partials.length },
    });

    return sanitizeDisciplinariExtraction(result);
  } catch (error) {
    console.error('[DISCIPLINARI_EXTRACTION] Error merging partials:', error);
    return createEmptyExtraction([
      `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    ]);
  }
}
