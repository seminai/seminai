import { PrismaClient } from '@prisma/client';

/**
 * Production unit information returned by the search.
 */
export interface UserProductionUnitInfo {
  id: string;
  name: string;
  areaHa: number;
  startDate: Date;
  endDate: Date;
  cropName?: string;
  cropType?: string;
  variety?: string;
  protectionStructure?: string;
  seasonYear?: number;
  fields: Array<{
    id: string;
    name: string;
    companyId: string | null;
    companyName: string | null;
    areaHaOnField: number;
  }>;
}

/**
 * Finds all production units accessible by the user through their companies' fields.
 * Optionally filters by crop name and/or companyId.
 * Uses fuzzy/elastic search: searches by UP name AND crop name.
 */
export async function findUserProductionUnits(params: {
  userId: string;
  cropName?: string;
  companyId?: string;
  prisma: PrismaClient;
}): Promise<UserProductionUnitInfo[]> {
  const { userId, cropName, companyId, prisma } = params;

  try {
    // Find production units linked to fields of companies the user has access to
    // Fetch ALL cycles (not filtered) to allow fuzzy matching
    const productionUnits = await prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: {
          some: {
            field: {
              ...(companyId ? { companyId } : {}),
              company: {
                companyUsers: {
                  some: { userId },
                },
              },
            },
          },
        },
      },
      include: {
        cycles: {
          orderBy: { seasonYear: 'desc' },
          take: 1, // Get most recent cycle for each PU
        },
        productionUnitsOnFields: {
          include: {
            field: {
              select: {
                id: true,
                name: true,
                companyId: true,
                company: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Format all results first
    const allResults: UserProductionUnitInfo[] = productionUnits.map((pu) => {
      const latestCycle = pu.cycles[0];

      return {
        id: pu.id,
        name: pu.name,
        areaHa: pu.areaHa,
        startDate: pu.startDate,
        endDate: pu.endDate,
        cropName: latestCycle?.cropName,
        cropType: latestCycle?.cropType,
        variety: latestCycle?.variety,
        protectionStructure: latestCycle?.protectionStructure,
        seasonYear: latestCycle?.seasonYear,
        fields: pu.productionUnitsOnFields.map((link) => ({
          id: link.field.id,
          name: link.field.name,
          companyId: link.field.companyId,
          companyName: link.field.company?.name ?? null,
          areaHaOnField: link.areaHaOnField,
        })),
      };
    });

    // If no cropName filter, return all
    if (!cropName) {
      return allResults;
    }

    // Elastic/fuzzy search: rank by UP name AND crop name
    const searchLower = cropName.toLowerCase().trim();
    const searchWords = searchLower.split(/\s+/).filter((w) => w.length > 0);

    const scoredResults = allResults.map((pu) => {
      const puNameLower = pu.name.toLowerCase();
      const cropNameLower = pu.cropName?.toLowerCase() || '';

      let score = 0;
      let matchType: 'exact' | 'contains' | 'fuzzy' | 'none' = 'none';

      // Check crop name first (highest priority)
      if (cropNameLower === searchLower) {
        score = 100;
        matchType = 'exact';
      } else if (cropNameLower.includes(searchLower)) {
        score = 70;
        matchType = 'contains';
      } else if (searchWords.every((word) => cropNameLower.includes(word))) {
        score = 50;
        matchType = 'fuzzy';
      }

      // Check UP name (secondary priority)
      if (puNameLower === searchLower) {
        score = Math.max(score, 60);
        matchType = matchType === 'none' ? 'exact' : matchType;
      } else if (puNameLower.includes(searchLower)) {
        score = Math.max(score, 40);
        matchType = matchType === 'none' ? 'contains' : matchType;
      } else if (searchWords.every((word) => puNameLower.includes(word))) {
        score = Math.max(score, 30);
        matchType = matchType === 'none' ? 'fuzzy' : matchType;
      }

      // Check field names (tertiary)
      const fieldMatches = pu.fields.filter((f) => {
        const fieldNameLower = f.name.toLowerCase();
        return (
          fieldNameLower.includes(searchLower) ||
          searchWords.some((w) => fieldNameLower.includes(w))
        );
      }).length;
      if (fieldMatches > 0) {
        score += 10 * fieldMatches;
      }

      return { pu, score, matchType };
    });

    // Filter out non-matching and sort by score
    const matchedResults = scoredResults
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.pu);

    // Return top 10 matches
    return matchedResults.slice(0, 10);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find user production units: ${errorMessage}`);
  }
}
