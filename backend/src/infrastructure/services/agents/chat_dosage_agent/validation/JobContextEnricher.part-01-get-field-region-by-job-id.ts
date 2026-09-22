import { prisma } from '../../../../repositories/Prisma';
import { isStopWord } from './JobContextEnricher.part-03-is-stop-word';

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
