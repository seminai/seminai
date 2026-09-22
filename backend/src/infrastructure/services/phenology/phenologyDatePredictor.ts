import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback, extractResponseText } from '../agents/dosage_agent/llmProvider';
import { LlmCacheService } from '../agents/dosage_agent/llmCacheService';
import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { prisma } from '../../repositories/Prisma';

const usageLogger = LlmUsageLogger.getInstance();
const llmCacheService = new LlmCacheService(prisma, 5);
const PROMPT_VERSION = 'phenology-predict-v1';

/**
 * Input for a single production unit phenology prediction request.
 */
export interface PhenologyPredictionInput {
  readonly index: number;
  readonly cropName: string;
  readonly cropType?: string;
  readonly variety?: string;
  readonly location?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

/**
 * A single additional cycle (for tree/multi-harvest crops).
 */
export interface PredictedCycle {
  readonly cycleIndex: number;
  readonly cropName: string;
  readonly floweringDate: string;
  readonly harvestingDate: string;
}

/**
 * Result for a single production unit.
 */
export interface PhenologyPredictionResult {
  readonly index: number;
  readonly floweringDate: string;
  readonly harvestingDate: string;
  readonly additionalCycles?: PredictedCycle[];
}

const PhenologyResponseSchema = z.object({
  floweringDate: z.string().describe('ISO date (YYYY-MM-DD) della fioritura'),
  harvestingDate: z.string().describe('ISO date (YYYY-MM-DD) della raccolta principale'),
  additionalCycles: z
    .array(
      z.object({
        cycleIndex: z.number(),
        cropName: z.string(),
        floweringDate: z.string(),
        harvestingDate: z.string(),
      }),
    )
    .optional()
    .describe('Cicli aggiuntivi per colture arboree con più raccolte (opzionale)'),
});

type PhenologyResponse = z.infer<typeof PhenologyResponseSchema>;

function buildPrompt(input: PhenologyPredictionInput, formatInstructions: string): string {
  const year = new Date().getFullYear();
  const loc = input.location || 'Italia';
  const varietyStr = input.variety ? ` (varietà: ${input.variety})` : '';
  const cropTypeStr = input.cropType ? ` [tipo: ${input.cropType}]` : '';
  const dateRangeStr =
    input.startDate && input.endDate
      ? `\nPERIODO DI CONDUZIONE: dal ${input.startDate} al ${input.endDate}`
      : '';

  return `Sei un agronomo esperto. Per la coltura indicata, determina la data di FIORITURA e la data di RACCOLTA tipiche.

COLTURA: ${input.cropName}${varietyStr}${cropTypeStr}
ZONA: ${loc}
ANNO: ${year}${dateRangeStr}

REGOLE:
- floweringDate: data di FIORITURA (o spigatura per i cereali, invaiatura per la vite)
- harvestingDate: data di RACCOLTA principale
- Le date devono essere nel formato ISO YYYY-MM-DD
- Se la coltura è ARBOREA o PERENNE e ha più raccolte nell'anno (es. agrumi, kiwi con raccolte scaglionate), restituisci i cicli aggiuntivi in "additionalCycles"
- Per colture con un solo ciclo di raccolta, NON includere "additionalCycles"

ESEMPI:
- Frumento duro, Centro Italia: floweringDate="${year}-05-10", harvestingDate="${year}-06-25"
- Vite, Toscana: floweringDate="${year}-06-01", harvestingDate="${year}-09-15"
- Olivo, Puglia: floweringDate="${year}-05-20", harvestingDate="${year}-10-20"
- Mais, Pianura Padana: floweringDate="${year}-07-15", harvestingDate="${year}-09-20"

${formatInstructions}`;
}

function buildCacheKey(input: PhenologyPredictionInput, modelName: string): string {
  return `phenology-predict:${LlmCacheService.createStableHash({
    cropName: input.cropName.toLowerCase(),
    cropType: (input.cropType || '').toLowerCase(),
    variety: (input.variety || '').toLowerCase(),
    location: (input.location || 'italia').toLowerCase(),
    year: new Date().getFullYear(),
    modelName,
    promptVersion: PROMPT_VERSION,
  })}`;
}

/**
 * Predict flowering/harvesting dates for a single crop via LLM (with cache).
 */
async function predictSingle(
  input: PhenologyPredictionInput,
  userId?: string,
): Promise<PhenologyResponse | null> {
  const tracker = usageLogger.createTracker();
  const parser = StructuredOutputParser.fromZodSchema(PhenologyResponseSchema);
  const formatInstructions = parser.getFormatInstructions();
  const prompt = buildPrompt(input, formatInstructions);

  try {
    const { result: parsed, usedModel } = await callWithFallback<PhenologyResponse>({
      operation: 'phenology-prediction',
      modelOptions: { temperature: 0 },
      execute: async (llm, modelName) => {
        const cacheKey = buildCacheKey(input, modelName);

        const cacheResult = await llmCacheService.getOrRefresh<PhenologyResponse>({
          namespace: 'phenology-predict',
          cacheKey,
          model: modelName,
          promptVersion: PROMPT_VERSION,
          userId,
          computeScore: (payload) => {
            let score = 0;
            if (payload.floweringDate) score++;
            if (payload.harvestingDate) score++;
            return score;
          },
          fetchFresh: async () => {
            const response = await llm.invoke(
              prompt.replace('{format_instructions}', formatInstructions),
              { callbacks: tracker.callbacks },
            );
            const content = extractResponseText(response.content);
            try {
              return await parser.parse(content);
            } catch {
              // Repair attempt
              const repairPrompt = `Output ONLY valid JSON matching:\n${formatInstructions}\n\nINVALID_OUTPUT:\n${content}`;
              const repaired = await llm.invoke(repairPrompt, { callbacks: tracker.callbacks });
              return await parser.parse(extractResponseText(repaired.content));
            }
          },
        });
        return cacheResult.payload;
      },
    });

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId,
      jobType: LlmJobType.DOSAGE,
      model: usedModel,
      metadata: {
        step: 'phenology-predict',
        cropName: input.cropName,
        variety: input.variety,
        location: input.location,
      },
    });

    return parsed;
  } catch (err) {
    console.error(`[PHENOLOGY-PREDICT] LLM failed for ${input.cropName}:`, err);
    return null;
  }
}

/**
 * Batch-predict flowering/harvesting dates for multiple production units.
 * Deduplicates by crop+variety+location to minimize LLM calls.
 */
export async function predictPhenologyDates(
  inputs: readonly PhenologyPredictionInput[],
  userId?: string,
): Promise<readonly PhenologyPredictionResult[]> {
  // Deduplicate by crop key
  const keyFn = (i: PhenologyPredictionInput) =>
    `${i.cropName.toLowerCase()}|${(i.variety || '').toLowerCase()}|${(i.location || '').toLowerCase()}`;

  const uniqueMap = new Map<string, PhenologyPredictionInput>();
  for (const input of inputs) {
    const key = keyFn(input);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, input);
    }
  }

  // Predict for each unique crop (in parallel with concurrency limit)
  const resultMap = new Map<string, PhenologyResponse>();
  const uniqueEntries = Array.from(uniqueMap.entries());

  // Process in chunks of 3 to avoid overwhelming the LLM
  const CHUNK_SIZE = 3;
  for (let i = 0; i < uniqueEntries.length; i += CHUNK_SIZE) {
    const chunk = uniqueEntries.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async ([key, input]) => {
        const result = await predictSingle(input, userId);
        return [key, result] as const;
      }),
    );
    for (const [key, result] of results) {
      if (result) {
        resultMap.set(key, result);
      }
    }
  }

  // Map results back to each input by index
  const results: PhenologyPredictionResult[] = [];
  for (const input of inputs) {
    const key = keyFn(input);
    const prediction = resultMap.get(key);
    if (!prediction) continue;

    const result: PhenologyPredictionResult = {
      index: input.index,
      floweringDate: prediction.floweringDate,
      harvestingDate: prediction.harvestingDate,
      ...(prediction.additionalCycles?.length
        ? { additionalCycles: prediction.additionalCycles }
        : {}),
    };
    results.push(result);
  }
  return results;
}
