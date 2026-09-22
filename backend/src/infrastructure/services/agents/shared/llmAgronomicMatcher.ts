import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback } from '../dosage_agent/llmProvider';
import { findCropTaxonomyContext } from '../dosage_agent/cropTaxonomyProvider';
import { DosageAgentContext } from '../dosage_agent/context';

/**
 * Schema for LLM agronomic name matching response
 */
const AgronomicMatchResultSchema = z.object({
  isMatch: z.boolean().describe('Whether the two names refer to the same entity'),
  confidence: z.number().min(0).max(100).describe('Confidence level (0-100)'),
  reason: z.string().describe('Brief explanation of the matching result'),
});

export type AgronomicMatchResult = z.infer<typeof AgronomicMatchResultSchema>;

type EntityType = 'crop' | 'adversity' | 'product';

const parser = StructuredOutputParser.fromZodSchema(AgronomicMatchResultSchema);

const CONFIDENCE_THRESHOLD = 70;

/**
 * In-memory cache for match results within a session.
 * Key format: `${normalizedA}|${normalizedB}|${entityType}`
 */
const matchCache = new Map<string, AgronomicMatchResult>();

function buildCacheKey(nameA: string, nameB: string, entityType: EntityType): string {
  const a = nameA.toLowerCase().trim();
  const b = nameB.toLowerCase().trim();
  // Ensure consistent key ordering
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${first}|${second}|${entityType}`;
}

const PROMPTS: Record<EntityType, string> = {
  crop: `Sei un esperto agronomico. Devi determinare se due nomi si riferiscono alla stessa coltura agricola.

NOME A: {nameA}
NOME B: {nameB}
{taxonomyContext}

REGOLE:
- Considera sinonimi botanici e nomi comuni (es. "Vitis vinifera" = "Vite" = "Uva da vino")
- Considera forme abbreviate (es. "vite" = "Vite da uva da vino")
- Considera categorie generali SOLO se un nome è la categoria dell'altro (es. "Pomacee" include "Melo")
- "frumento" = "grano tenero", "granturco" = "mais"
- Confidence: 90-100 per sinonimi diretti, 75-89 per categoria generale, <50 se nessuna relazione

{format_instructions}
Rispondi SOLO con il JSON richiesto.`,

  adversity: `Sei un esperto fitopatologo. Devi determinare se due nomi si riferiscono alla stessa avversità/malattia/parassita agricolo.

NOME A: {nameA}
NOME B: {nameB}

REGOLE:
- Considera nomi comuni e scientifici (es. "Peronospora" = "Plasmopara viticola")
- Considera forme abbreviate o generiche (es. "oidio" = "Oidio della vite" = "Erysiphe necator")
- Considera nomi in italiano e latino
- Confidence: 90-100 per sinonimi diretti, 75-89 per corrispondenza parziale, <50 se nessuna relazione

{format_instructions}
Rispondi SOLO con il JSON richiesto.`,

  product: `Sei un esperto di prodotti fitosanitari. Devi determinare se due nomi si riferiscono allo stesso prodotto o principio attivo.

NOME A: {nameA}
NOME B: {nameB}

REGOLE:
- Considera nomi commerciali e principi attivi (es. "Captano 80 WDG" contiene "Captano")
- Considera formulazioni diverse dello stesso prodotto
- Considera forme normalizzate (es. "FOLPEC" = "Folpec" = "folpec")
- Confidence: 90-100 per stesso prodotto, 75-89 per stesso principio attivo con formulazione diversa, <50 se nessuna relazione

{format_instructions}
Rispondi SOLO con il JSON richiesto.`,
};

/**
 * Uses LLM (Claude with OpenAI fallback) to determine if two agronomic names
 * refer to the same entity (crop, adversity, or product).
 *
 * Results are cached per (nameA, nameB, entityType) tuple within the session.
 */
export async function llmMatchAgronomicNames(params: {
  nameA: string;
  nameB: string;
  entityType: EntityType;
  context?: DosageAgentContext;
}): Promise<AgronomicMatchResult> {
  const { nameA, nameB, entityType, context } = params;

  // Quick equality check
  if (nameA.toLowerCase().trim() === nameB.toLowerCase().trim()) {
    return { isMatch: true, confidence: 100, reason: 'Nomi identici' };
  }

  // Check cache
  const cacheKey = buildCacheKey(nameA, nameB, entityType);
  const cached = matchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build taxonomy context for crop matching
  let taxonomyContext = '';
  if (entityType === 'crop') {
    const taxA = findCropTaxonomyContext(nameA);
    const taxB = findCropTaxonomyContext(nameB);
    const parts: string[] = [];
    if (taxA) {
      parts.push(
        `TASSONOMIA NOME A: Categoria=${taxA.agronomicCategory}, Famiglia=${taxA.family}, Genere=${taxA.genus}, Specie=${taxA.species}`,
      );
    }
    if (taxB) {
      parts.push(
        `TASSONOMIA NOME B: Categoria=${taxB.agronomicCategory}, Famiglia=${taxB.family}, Genere=${taxB.genus}, Specie=${taxB.species}`,
      );
    }
    taxonomyContext =
      parts.length > 0 ? parts.join('\n') : 'Nessun contesto tassonomico disponibile.';
  }

  const promptTemplate = PromptTemplate.fromTemplate(PROMPTS[entityType]);

  const fallbackResult: AgronomicMatchResult = {
    isMatch: false,
    confidence: 0,
    reason: 'LLM non disponibile. Fallback conservativo: nessun match.',
  };

  try {
    const { result } = await callWithFallback<AgronomicMatchResult>({
      operation: 'crop-matcher',
      context,
      modelOptions: { temperature: 0, maxTokens: 200 },
      execute: async (llm) => {
        const chain = promptTemplate.pipe(llm).pipe(parser);
        return chain.invoke({
          nameA,
          nameB,
          taxonomyContext,
          format_instructions: parser.getFormatInstructions(),
        });
      },
    });

    // Apply threshold
    const finalResult: AgronomicMatchResult = {
      ...result,
      isMatch: result.isMatch && result.confidence >= CONFIDENCE_THRESHOLD,
    };

    matchCache.set(cacheKey, finalResult);
    return finalResult;
  } catch (err) {
    console.warn(
      `[llmMatchAgronomicNames] All providers failed for "${nameA}" vs "${nameB}" (${entityType}):`,
      err instanceof Error ? err.message : err,
    );
    matchCache.set(cacheKey, fallbackResult);
    return fallbackResult;
  }
}

/**
 * Checks if any name in a list matches the target using LLM.
 * Returns the first matching name, or null if none match.
 */
export async function llmFindMatchingName(params: {
  candidates: ReadonlyArray<string>;
  target: string;
  entityType: EntityType;
  context?: DosageAgentContext;
}): Promise<string | null> {
  const { candidates, target, entityType, context } = params;
  for (const candidate of candidates) {
    const result = await llmMatchAgronomicNames({
      nameA: candidate,
      nameB: target,
      entityType,
      context,
    });
    if (result.isMatch) {
      return candidate;
    }
  }
  return null;
}

/**
 * Filters a list of names, keeping only those that match the target using LLM.
 */
export async function llmFilterMatchingNames(params: {
  candidates: ReadonlyArray<string>;
  target: string;
  entityType: EntityType;
  context?: DosageAgentContext;
}): Promise<string[]> {
  const { candidates, target, entityType, context } = params;
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await llmMatchAgronomicNames({
        nameA: candidate,
        nameB: target,
        entityType,
        context,
      });
      return { candidate, isMatch: result.isMatch };
    }),
  );
  return results.filter((r) => r.isMatch).map((r) => r.candidate);
}

/**
 * Clears the in-memory match cache. Useful for testing.
 */
export function clearAgronomicMatchCache(): void {
  matchCache.clear();
}
