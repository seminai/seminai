import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { Label } from '../../../../domain/dtos/label.dto';
import { CropTaxonomyContext } from './cropTaxonomyProvider';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { callWithFallback } from './llmProvider';
import { mapWithLimit } from './parallelLimiter';
import { lookupProductCropMatch, storeProductCropMatch } from './productCropMatchCache';

/**
 * Schema per la risposta del matching LLM
 */
const MatchResultSchema = z.object({
  isCompatible: z.boolean().describe('Se il prodotto è compatibile con la coltura target'),
  confidence: z.number().min(0).max(100).describe('Livello di confidenza del match (0-100)'),
  reason: z
    .string()
    .describe('Breve spiegazione del perché il prodotto è o non è compatibile con la coltura'),
  matchedCrops: z
    .array(z.string())
    .describe('Lista di colture dal prodotto che matchano con la target'),
});

type MatchResult = z.infer<typeof MatchResultSchema>;

const parser = StructuredOutputParser.fromZodSchema(MatchResultSchema);
const usageLogger = LlmUsageLogger.getInstance();

/**
 * Usa LLM (Claude con fallback a OpenAI) per determinare se un prodotto
 * fitosanitario è compatibile con una specifica coltura target basandosi
 * sull'etichetta estratta.
 */
export async function llmMatchProductToCrop(
  productName: string,
  label: Label,
  targetCropName: string,
  targetVariety?: string,
  cropContext?: CropTaxonomyContext,
  context?: DosageAgentContext,
): Promise<MatchResult> {
  const logger = DosageLoggerService.getInstance();

  // Cache lookup BEFORE the LLM call. Key is the SIAN registration number
  // (stable per product) + normalized crop name + variety. A single dosage
  // job can issue 14-50 matches in parallel; a warm cache makes them ~free.
  const cached = await lookupProductCropMatch(
    label.numero_registrazione ?? null,
    targetCropName,
    targetVariety ?? null,
  );
  if (cached) {
    console.log(
      `[LLM-MATCH] CACHE HIT for "${productName}" (reg=${label.numero_registrazione}) vs Crop "${targetCropName}": compatible=${cached.isCompatible}, confidence=${cached.confidence}%`,
    );
    return {
      isCompatible: cached.isCompatible,
      confidence: cached.confidence,
      reason: cached.reason,
      matchedCrops: [...cached.matchedCrops],
    };
  }

  // Costruisci lista colture dal prodotto
  const coltureTarget = Array.isArray(label.colture_target) ? label.colture_target : [];
  const dosaggi = Array.isArray(label.dosaggi_dettagliati) ? label.dosaggi_dettagliati : [];
  const coltureDaDosaggi = dosaggi
    .map((d) => String((d as { coltura?: string }).coltura ?? ''))
    .filter((c) => c.length > 0);
  const allCrops = [...new Set([...coltureTarget, ...coltureDaDosaggi])];

  const promptTemplate = PromptTemplate.fromTemplate(`
Sei un esperto agronomico. Devi determinare se un prodotto fitosanitario è compatibile con una coltura target.

PRODOTTO: {productName}
CATEGORIA PRODOTTO: {categoria}
PRINCIPIO ATTIVO: {principioAttivo}

COLTURE AUTORIZZATE PER QUESTO PRODOTTO:
{crops}

COLTURA TARGET: {targetCrop}
VARIETÀ TARGET: {targetVariety}
NOME COMUNE TARGET: {targetCommonName}
CATEGORIA AGRONOMICA TARGET: {targetCategory}
FAMIGLIA BOTANICA TARGET: {targetFamily}
SPECIE BOTANICA TARGET: {targetSpecies}
GENERE TARGET: {targetGenus}
CLASSE TARGET: {targetClass}
ORDINE TARGET: {targetOrder}

ANALIZZA:
1. Se la coltura target (o varietà) è presente nell'elenco delle colture autorizzate
2. Se la coltura target appartiene a una categoria generale presente (es. "Vite" include "Vitis vinifera", "Pomacee" include "Melo", "Cereali" include "Grano tenero")
3. Considera sinonimi botanici e nomi comuni (es. "Vitis vinifera" = "Vite" = "Uva")

REGOLE:
- Se c'è un match diretto o una categoria generale che include la target → isCompatible = true
- Se non c'è nessuna relazione → isCompatible = false
- Confidence: 90-100 per match diretto o sinonimo diretto della stessa coltura (es. "frumento" = "grano tenero", "granturco" = "mais"), 75-89 per categoria generale che include la target (es. "Cereali" include "Grano tenero", "Pomacee" include "Melo"), 60-74 per relazione botanica indiretta (stessa famiglia o genere ma specie diversa)
- Se non sei sicuro o non c'è relazione → confidence < 50 e isCompatible = false

{format_instructions}

Rispondi SOLO con il JSON richiesto, senza testo aggiuntivo.
`);

  const fallbackResult: MatchResult = {
    isCompatible: false,
    confidence: 0,
    reason: 'Matching LLM non disponibile. Utilizzato fallback conservativo.',
    matchedCrops: [],
  };

  const promptInputs = {
    productName,
    categoria: label.categoria || 'N/A',
    principioAttivo: label.principio_attivo || 'N/A',
    crops: allCrops.length > 0 ? allCrops.join(', ') : 'Nessuna coltura specificata',
    targetCrop: targetCropName || 'N/A',
    targetVariety: targetVariety || 'N/A',
    targetCommonName: cropContext?.commonName || targetCropName || 'N/A',
    targetCategory: cropContext?.agronomicCategory || 'N/A',
    targetFamily: cropContext?.family || 'N/A',
    targetSpecies: cropContext?.species || targetVariety || 'N/A',
    targetGenus: cropContext?.genus || 'N/A',
    targetClass: cropContext?.className || 'N/A',
    targetOrder: cropContext?.order || 'N/A',
    format_instructions: parser.getFormatInstructions(),
  };

  try {
    const { result, usedModel, fallbackUsed } = await callWithFallback<MatchResult>({
      operation: 'crop-matcher',
      context,
      modelOptions: { temperature: 0, maxTokens: 500 },
      execute: async (llm, modelName) => {
        const tracker = usageLogger.createTracker();
        const chain = promptTemplate.pipe(llm).pipe(parser);
        const chainResult = await chain.invoke(promptInputs, {
          callbacks: tracker.callbacks,
        });
        await usageLogger.logFromAccumulator(tracker.accumulator, {
          userId: context?.userId,
          companyId: context?.companyId,
          jobId: context?.jobId,
          jobGroupId: context?.jobGroupId,
          jobType: context?.jobType ?? LlmJobType.DOSAGE,
          model: modelName,
          metadata: { step: 'llm-crop-match', productName, cropName: targetCropName },
        });
        return chainResult;
      },
    });

    const fallbackTag = fallbackUsed ? ` (fallback: ${usedModel})` : '';
    console.log(
      `[LLM-MATCH] Product "${productName}" vs Crop "${targetCropName}": compatible=${result.isCompatible}, confidence=${result.confidence}%${fallbackTag}`,
    );
    console.log(`[LLM-MATCH] Reason: ${result.reason}`);

    if (hasContext(context)) {
      logger.logLLMMatch({
        jobId: context.jobId,
        userId: context.userId,
        productName,
        cropName: targetCropName,
        compatible: result.isCompatible,
        confidence: result.confidence,
        reason: result.reason,
      });
    }

    // Persist for next time. Fire-and-forget: cache write errors are
    // already swallowed inside the helper. Only cache when we have a stable
    // registration number — otherwise the key would not be reproducible.
    if (label.numero_registrazione) {
      void storeProductCropMatch(
        label.numero_registrazione,
        targetCropName,
        targetVariety ?? null,
        result,
        usedModel,
      );
    }

    return result;
  } catch (err) {
    console.warn(
      `[LLM-MATCH] All providers failed for ${productName} -> ${targetCropName}:`,
      err instanceof Error ? err.message : err,
    );
    if (hasContext(context)) {
      logger.logWarning({
        jobId: context.jobId,
        userId: context.userId,
        message: `LLM matching: all providers failed for ${productName}`,
        metadata: {
          productName,
          cropName: targetCropName,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
    return fallbackResult;
  }
}

/**
 * Batch matching per più prodotti contro una singola coltura target.
 * Usa un prompt più efficiente per ridurre chiamate API.
 */
export async function llmBatchMatchProductsToCrop(
  products: Array<{ key: string; name: string; label: Label }>,
  targetCropName: string,
  targetVariety?: string,
  cropContext?: CropTaxonomyContext,
  context?: DosageAgentContext,
): Promise<Map<string, MatchResult>> {
  if (products.length === 0) {
    return new Map();
  }

  const LLM_CONCURRENCY_LIMIT = 10;

  console.log(
    `[LLM-MATCH] Starting batch matching for ${products.length} products against "${targetCropName}" (concurrency: ${LLM_CONCURRENCY_LIMIT})`,
  );

  const entries = await mapWithLimit(
    products,
    async (product) => {
      const matchResult: MatchResult = await llmMatchProductToCrop(
        product.name,
        product.label,
        targetCropName,
        targetVariety,
        cropContext,
        context,
      );
      return [product.key, matchResult] as const;
    },
    LLM_CONCURRENCY_LIMIT,
  );

  const results = new Map<string, MatchResult>(entries);

  const matchedCount = Array.from(results.values()).filter((r) => r.isCompatible).length;
  console.log(
    `[LLM-MATCH] Batch matching completed: ${matchedCount}/${products.length} products matched`,
  );

  return results;
}
