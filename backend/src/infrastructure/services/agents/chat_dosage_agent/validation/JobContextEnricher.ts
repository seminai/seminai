/**
 * Helper functions to enrich job context with region and keyword information.
 * Used for validating Tavily search results against the job's geographic context.
 */

import { prisma } from '../../../../repositories/Prisma';

/**
 * Gets the region(s) associated with a job through its production unit and fields.
 * Path: Job → ProductionUnit → ProductionUnitOnField → Field.region
 *
 * @param jobId - The ID of the job
 * @returns The primary region (first non-null region found) or null if not found
 */
export async function getFieldRegionByJobId(jobId: string): Promise<string | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      productionUnit: {
        select: {
          productionUnitsOnFields: {
            select: {
              field: {
                select: {
                  region: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!job?.productionUnit?.productionUnitsOnFields) {
    return null;
  }

  // Find the first non-null region from the fields
  for (const allocation of job.productionUnit.productionUnitsOnFields) {
    if (allocation.field?.region) {
      return allocation.field.region;
    }
  }

  return null;
}

/**
 * Gets all unique regions associated with a job's fields.
 *
 * @param jobId - The ID of the job
 * @returns Array of unique region names
 */
export async function getAllFieldRegionsByJobId(jobId: string): Promise<string[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      productionUnit: {
        select: {
          productionUnitsOnFields: {
            select: {
              field: {
                select: {
                  region: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!job?.productionUnit?.productionUnitsOnFields) {
    return [];
  }

  const regions = new Set<string>();
  for (const allocation of job.productionUnit.productionUnitsOnFields) {
    if (allocation.field?.region) {
      regions.add(allocation.field.region);
    }
  }

  return Array.from(regions);
}

/**
 * Extracts keywords from a user query for validation purposes.
 * Identifies potential product names, active ingredients, crops, and targets.
 *
 * @param query - The user's search query
 * @returns Array of extracted keywords
 */
export function extractKeywordsFromQuery(query: string): string[] {
  const keywords: string[] = [];

  // Common patterns to extract
  const patterns = [
    // Product/ingredient patterns
    /(?:prodotto|principio attivo|sostanza attiva|fitosanitario|agrofarmaco)\s+["']?([a-zA-ZÀ-ÿ0-9\-\s]+)["']?/gi,
    // Crop patterns
    /(?:coltura|coltivazione|pianta|per\s+(?:il|la|i|le))\s+["']?([a-zA-ZÀ-ÿ]+)["']?/gi,
    // Target patterns
    /(?:contro|per|avversità|malattia|patogeno|insetto|fungo)\s+["']?([a-zA-ZÀ-ÿ]+)["']?/gi,
    // Conformity patterns - extract the product being checked
    /(?:è\s+)?["']?([a-zA-ZÀ-ÿ0-9\-]+)["']?\s+(?:è\s+)?(?:conforme|autorizzato|ammesso)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(query)) !== null) {
      const keyword = match[1].trim();
      if (keyword.length >= 3 && !isStopWord(keyword)) {
        keywords.push(keyword);
      }
    }
  }

  // Also extract quoted strings which often contain important terms
  const quotedPattern = /["']([^"']+)["']/g;
  let quotedMatch;
  while ((quotedMatch = quotedPattern.exec(query)) !== null) {
    const term = quotedMatch[1].trim();
    if (term.length >= 3 && !keywords.includes(term)) {
      keywords.push(term);
    }
  }

  // Extract capitalized words that might be product names (excluding common words)
  const capitalizedPattern = /\b([A-Z][a-zA-Zà-ÿ]{2,}(?:\s+[0-9]+)?)\b/g;
  let capMatch;
  while ((capMatch = capitalizedPattern.exec(query)) !== null) {
    const term = capMatch[1].trim();
    if (!isStopWord(term) && !keywords.includes(term) && !keywords.includes(term.toLowerCase())) {
      keywords.push(term);
    }
  }

  // Deduplicate and clean
  const uniqueKeywords = [...new Set(keywords.map((k) => k.toLowerCase()))];

  return uniqueKeywords.filter((k) => k.length >= 3);
}

/**
 * List of Italian stop words to filter out.
 */
const STOP_WORDS = new Set([
  'che',
  'del',
  'della',
  'dei',
  'delle',
  'nel',
  'nella',
  'nei',
  'nelle',
  'con',
  'per',
  'tra',
  'fra',
  'sul',
  'sulla',
  'sui',
  'sulle',
  'dal',
  'dalla',
  'dai',
  'dalle',
  'una',
  'uno',
  'gli',
  'sono',
  'essere',
  'questo',
  'questa',
  'questi',
  'queste',
  'quello',
  'quella',
  'quelli',
  'quelle',
  'come',
  'quale',
  'quali',
  'quando',
  'dove',
  'perché',
  'perche',
  'cosa',
  'chi',
  'anche',
  'solo',
  'molto',
  'poco',
  'tanto',
  'tutto',
  'tutti',
  'tutte',
  'ogni',
  'altro',
  'altri',
  'altre',
  'stesso',
  'stessa',
  'stessi',
  'stesse',
  'proprio',
  'propria',
  'propri',
  'proprie',
  'fare',
  'fatto',
  'fatta',
  'fatti',
  'fatte',
  'dire',
  'detto',
  'detta',
  'detti',
  'dette',
  'avere',
  'avuto',
  'avuta',
  'avuti',
  'avute',
  'potere',
  'dovere',
  'volere',
  'sapere',
  'vedere',
  'visto',
  'vista',
  'visti',
  'viste',
  'anno',
  'anni',
  'mese',
  'mesi',
  'giorno',
  'giorni',
  'ora',
  'ore',
  'momento',
  'tempo',
  'volta',
  'volte',
  'modo',
  'modi',
  'parte',
  'parti',
  'caso',
  'casi',
  'tipo',
  'tipi',
  'punto',
  'punti',
  'via',
  'quindi',
  'però',
  'pero',
  'infatti',
  'invece',
  'dunque',
  'allora',
  'così',
  'cosi',
  'bene',
  'male',
  'sempre',
  'mai',
  'già',
  'ancora',
  'prima',
  'dopo',
  'sopra',
  'sotto',
  'dentro',
  'fuori',
  'circa',
  'quasi',
  'oltre',
  'meno',
  'più',
  'piu',
  'senza',
  'verso',
  'presso',
  'entro',
  'lungo',
  'durante',
  'secondo',
  'mediante',
  'nonostante',
  'affinché',
  'affinche',
  'sebbene',
  'benché',
  'benche',
  'purché',
  'purche',
  'finché',
  'finche',
  'mentre',
  'prima',
  'dopo',
  'siccome',
  'poiché',
  'poiche',
  'giacché',
  'giacche',
  'oppure',
  'ovvero',
  'ossia',
  'cioè',
  'cioe',
  // Agricultural context stop words
  'disciplinare',
  'regione',
  'regionale',
  'provincia',
  'provinciale',
  'conforme',
  'conformità',
  'conformita',
  'autorizzato',
  'ammesso',
  'consentito',
  'vietato',
  'produzione',
  'integrata',
  'biologica',
  'biologico',
]);

/**
 * Checks if a word is a stop word.
 */
function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

/**
 * Gets additional context from a job including crop name and production unit info.
 *
 * @param jobId - The ID of the job
 * @returns Object with region, cropName, and productionUnitName
 */
export async function getJobContext(
  jobId: string,
): Promise<{ region: string | null; cropName: string | null; productionUnitName: string | null }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      productionUnit: {
        include: {
          productionUnitsOnFields: {
            include: {
              field: true,
            },
          },
          cycles: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!job?.productionUnit) {
    return { region: null, cropName: null, productionUnitName: null };
  }

  let region: string | null = null;
  for (const allocation of job.productionUnit.productionUnitsOnFields) {
    if (allocation.field?.region) {
      region = allocation.field.region;
      break;
    }
  }

  // Get cropName from the most recent production cycle
  const cropName = job.productionUnit.cycles?.[0]?.cropName ?? null;

  return {
    region,
    cropName,
    productionUnitName: job.productionUnit.name ?? null,
  };
}
