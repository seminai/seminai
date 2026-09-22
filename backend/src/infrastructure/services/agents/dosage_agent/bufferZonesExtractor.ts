import { z } from 'zod';
import { Label } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { createChatModel } from '../../llm-model-factory';

/**
 * Schema for buffer zones extraction result
 */
const BufferZonesSchema = z.object({
  fasce_rispetto_acqua: z
    .string()
    .nullable()
    .describe('Fasce di rispetto da corsi d\'acqua (es. "5 metri", "10 m non trattati")'),
  fasce_rispetto_colture: z
    .string()
    .nullable()
    .describe('Fasce di rispetto da altre colture (es. "20 metri da colture adiacenti")'),
});

export type BufferZonesResult = z.infer<typeof BufferZonesSchema>;

/**
 * Cache for buffer zones to avoid redundant LLM calls for the same product
 */
const bufferZonesCache = new Map<string, BufferZonesResult>();
const usageLogger = LlmUsageLogger.getInstance();

/**
 * Extract buffer zones (fasce di rispetto) from label.
 * Priority:
 * 1. Use pre-extracted fields (fasce_rispetto_acqua, fasce_rispetto_colture) if available
 * 2. Try algorithmic extraction from fasce_di_rispetto_e_deriva
 * 3. Fall back to LLM for complex cases
 *
 * @param label - The product label
 * @returns Buffer zones for water and crops, or null if not present
 */
export async function extractBufferZones(
  label: Label,
  context?: DosageAgentContext,
): Promise<BufferZonesResult> {
  const cacheKey = label.prodotto || label.numero_registrazione || '';

  // Check cache first
  if (cacheKey && bufferZonesCache.has(cacheKey)) {
    return bufferZonesCache.get(cacheKey)!;
  }

  // Priority 1: Use pre-extracted fields from label extraction (already extracted by LLM)
  const preExtractedAcqua = label.fasce_rispetto_acqua?.trim() || null;
  const preExtractedColture = label.fasce_rispetto_colture?.trim() || null;

  if (preExtractedAcqua || preExtractedColture) {
    const preExtractedResult: BufferZonesResult = {
      fasce_rispetto_acqua: preExtractedAcqua,
      fasce_rispetto_colture: preExtractedColture,
    };
    console.log(
      `[BUFFER-ZONES] Using pre-extracted data from label: acqua=${preExtractedAcqua ? 'yes' : 'no'}, colture=${preExtractedColture ? 'yes' : 'no'}`,
    );
    if (cacheKey) bufferZonesCache.set(cacheKey, preExtractedResult);
    return preExtractedResult;
  }

  const fasceArray = label.fasce_di_rispetto_e_deriva || [];

  // Return null values if no buffer zone data
  if (fasceArray.length === 0) {
    const emptyResult: BufferZonesResult = {
      fasce_rispetto_acqua: null,
      fasce_rispetto_colture: null,
    };
    if (cacheKey) bufferZonesCache.set(cacheKey, emptyResult);
    return emptyResult;
  }

  // Priority 2: Try algorithmic extraction (faster, no LLM cost)
  const algorithmicResult = extractBufferZonesAlgorithmic(fasceArray);

  // If we found at least one match algorithmically, use it
  if (algorithmicResult.fasce_rispetto_acqua || algorithmicResult.fasce_rispetto_colture) {
    if (cacheKey) bufferZonesCache.set(cacheKey, algorithmicResult);
    return algorithmicResult;
  }

  // Priority 3: Fall back to LLM for complex/ambiguous text
  const llmResult = await extractBufferZonesWithLLM(fasceArray, context);
  if (cacheKey) bufferZonesCache.set(cacheKey, llmResult);
  return llmResult;
}

/**
 * Algorithmic extraction using regex patterns for common buffer zone phrases
 */
function extractBufferZonesAlgorithmic(fasceArray: string[]): BufferZonesResult {
  const fullText = fasceArray.join(' ').toLowerCase();

  let fasce_rispetto_acqua: string | null = null;
  let fasce_rispetto_colture: string | null = null;

  // Patterns for water buffer zones
  const waterPatterns = [
    /(?:fascia?\s+(?:di\s+)?rispetto|distanza|zona\s+(?:non\s+)?trattata?)\s*(?:da(?:i)?\s+)?(?:cors[io]\s+d['']?acqua|canali?|fossi?|laghi?|fiumi?|torrenti?|acque\s+superficiali?|specchi?\s+d['']?acqua)[^.;]*?(\d+\s*(?:m(?:etri)?|cm))/i,
    /(\d+\s*(?:m(?:etri)?|cm))\s*(?:da(?:i)?\s+)?(?:cors[io]\s+d['']?acqua|canali?|fossi?|laghi?|fiumi?|torrenti?|acque\s+superficiali?)/i,
    /(?:cors[io]\s+d['']?acqua|canali?|fossi?|laghi?|fiumi?|torrenti?|acque\s+superficiali?)[^.;]*?(?:fascia?\s+(?:di\s+)?rispetto|distanza)[^.;]*?(\d+\s*(?:m(?:etri)?|cm))/i,
  ];

  // Patterns for crop buffer zones
  const cropPatterns = [
    /(?:fascia?\s+(?:di\s+)?rispetto|distanza|zona\s+(?:non\s+)?trattata?)\s*(?:da(?:lle)?\s+)?(?:colture?\s+(?:adiacenti?|limitrofe?|sensibili?|confinanti?)|aree?\s+(?:coltivate?|agricole?))[^.;]*?(\d+\s*(?:m(?:etri)?|cm))/i,
    /(\d+\s*(?:m(?:etri)?|cm))\s*(?:da(?:lle)?\s+)?(?:colture?\s+(?:adiacenti?|limitrofe?|sensibili?|confinanti?))/i,
    /(?:colture?\s+(?:adiacenti?|limitrofe?|sensibili?|confinanti?)|aree?\s+(?:coltivate?|agricole?))[^.;]*?(?:fascia?\s+(?:di\s+)?rispetto|distanza)[^.;]*?(\d+\s*(?:m(?:etri)?|cm))/i,
  ];

  // Search for water buffer zones
  for (const pattern of waterPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      // Find the full relevant sentence/phrase
      const relevantPhrase = findRelevantPhrase(fasceArray, [
        'acqua',
        'canal',
        'foss',
        'lago',
        'fiume',
        'torrente',
      ]);
      fasce_rispetto_acqua = relevantPhrase || match[1];
      break;
    }
  }

  // Search for crop buffer zones
  for (const pattern of cropPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const relevantPhrase = findRelevantPhrase(fasceArray, [
        'coltur',
        'adiacent',
        'limitrof',
        'sensibil',
        'confinant',
      ]);
      fasce_rispetto_colture = relevantPhrase || match[1];
      break;
    }
  }

  return { fasce_rispetto_acqua, fasce_rispetto_colture };
}

/**
 * Find the most relevant phrase from the array containing specific keywords
 */
function findRelevantPhrase(fasceArray: string[], keywords: string[]): string | null {
  for (const phrase of fasceArray) {
    const lowerPhrase = phrase.toLowerCase();
    if (keywords.some((kw) => lowerPhrase.includes(kw))) {
      // Clean up and return the phrase
      return phrase.trim();
    }
  }
  return null;
}

/**
 * LLM-based extraction for complex/ambiguous buffer zone text
 */
async function extractBufferZonesWithLLM(
  fasceArray: string[],
  context?: DosageAgentContext,
): Promise<BufferZonesResult> {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
  });
  const tracker = usageLogger.createTracker();

  const fasceText = fasceArray.join('\n');

  const prompt = `Analizza il seguente testo relativo alle fasce di rispetto di un prodotto fitosanitario ed estrai le informazioni richieste.

TESTO FASCE DI RISPETTO:
${fasceText}

COMPITO:
Estrai le seguenti informazioni:

1. fasce_rispetto_acqua: Fasce di rispetto da CORSI D'ACQUA (fiumi, canali, fossi, laghi, torrenti, acque superficiali).
   - Cerca riferimenti a distanze da corsi d'acqua, zone buffer vicino all'acqua, fasce non trattate vicino a corpi idrici
   - Esempi: "5 metri da corsi d'acqua", "fascia di rispetto 10 m dai corpi idrici", "zona non trattata di 20 m dai canali"
   - Se presente, riporta la frase completa che descrive la fascia
   - Se NON presente, restituisci null

2. fasce_rispetto_colture: Fasce di rispetto da ALTRE COLTURE (colture adiacenti, limitrofe, sensibili, confinanti).
   - Cerca riferimenti a distanze da altre colture o aree coltivate
   - Esempi: "20 metri da colture adiacenti", "fascia non trattata verso colture sensibili"
   - Se presente, riporta la frase completa che descrive la fascia
   - Se NON presente, restituisci null

IMPORTANTE:
- Riporta il testo originale, non parafrasare
- Se un'informazione non è presente, restituisci null (non stringa vuota)
- Non confondere le fasce per deriva (riguardano la dispersione del prodotto) con le fasce di rispetto ambientali

Rispondi SOLO in JSON:
{"fasce_rispetto_acqua": "testo o null", "fasce_rispetto_colture": "testo o null"}`;

  try {
    const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
    const content = typeof response.content === 'string' ? response.content : '';
    const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
    const json = JSON.parse(cleanedContent);

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: resolvedModelName,
      metadata: { step: 'buffer-zones-llm', fasceCount: fasceArray.length },
    });

    return BufferZonesSchema.parse({
      fasce_rispetto_acqua: json.fasce_rispetto_acqua || null,
      fasce_rispetto_colture: json.fasce_rispetto_colture || null,
    });
  } catch (err) {
    console.error('[BUFFER-ZONES] LLM extraction failed:', err);
    return {
      fasce_rispetto_acqua: null,
      fasce_rispetto_colture: null,
    };
  }
}

/**
 * Clear the buffer zones cache (useful for testing)
 */
export function clearBufferZonesCache(): void {
  bufferZonesCache.clear();
}
