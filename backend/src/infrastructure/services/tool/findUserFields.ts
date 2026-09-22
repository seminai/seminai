import { PrismaClient } from '@prisma/client';

/**
 * Field information returned by the search.
 */
export interface UserFieldInfo {
  id: string;
  name: string;
  companyId: string | null;
  companyName?: string;
  sauHa: number | null;
  gisHa: number | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  cropName?: string;
  productionUnits: Array<{
    id: string;
    name: string;
    areaHa: number;
  }>;
}

/**
 * Finds all fields accessible by the user through their companies.
 * Optionally filters by search term and/or companyId.
 * Uses fuzzy/elastic search: if exact match not found, returns similar fields.
 */
export async function findUserFields(params: {
  userId: string;
  searchTerm?: string;
  companyId?: string;
  prisma: PrismaClient;
}): Promise<UserFieldInfo[]> {
  const { userId, searchTerm, companyId, prisma } = params;

  try {
    // Find all companies the user has access to
    const userCompanies = await prisma.userOnCompany.findMany({
      where: {
        userId,
        ...(companyId ? { companyId } : {}),
      },
      include: {
        company: {
          include: {
            fields: {
              // Always fetch all fields when searchTerm is provided, we'll filter/rank them
              include: {
                productionUnitsOnFields: {
                  include: {
                    productionUnit: {
                      include: {
                        cycles: {
                          orderBy: { seasonYear: 'desc' },
                          take: 1,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Flatten and format the results
    const allFields: UserFieldInfo[] = [];

    for (const userCompany of userCompanies) {
      for (const field of userCompany.company.fields) {
        const productionUnits = field.productionUnitsOnFields.map((link) => ({
          id: link.productionUnit.id,
          name: link.productionUnit.name,
          areaHa: link.areaHaOnField,
        }));

        // Get crop name from the most recent cycle if available
        const latestCycle = field.productionUnitsOnFields[0]?.productionUnit.cycles[0];

        allFields.push({
          id: field.id,
          name: field.name,
          companyId: field.companyId,
          companyName: userCompany.company.name,
          sauHa: field.sauHa,
          gisHa: field.gisHa,
          latitude: field.latitude,
          longitude: field.longitude,
          address: field.address,
          city: field.city,
          cropName: latestCycle?.cropName,
          productionUnits,
        });
      }
    }

    // If no search term, return all fields
    if (!searchTerm) {
      return allFields;
    }

    // Elastic/fuzzy search: rank fields by similarity
    const searchLower = searchTerm.toLowerCase().trim();
    const searchWords = searchLower.split(/\s+/).filter((w) => w.length > 0);

    const scoredFields = allFields.map((field) => {
      const fieldNameLower = field.name.toLowerCase();
      const cropNameLower = field.cropName?.toLowerCase() || '';
      const companyNameLower = field.companyName?.toLowerCase() || '';

      let score = 0;
      let matchType: 'exact' | 'contains' | 'fuzzy' | 'none' = 'none';

      // Exact match (highest priority)
      if (fieldNameLower === searchLower) {
        score = 100;
        matchType = 'exact';
      }
      // Starts with search term
      else if (fieldNameLower.startsWith(searchLower)) {
        score = 80;
        matchType = 'contains';
      }
      // Contains search term
      else if (fieldNameLower.includes(searchLower)) {
        score = 60;
        matchType = 'contains';
      }
      // All search words present (fuzzy)
      else if (searchWords.every((word) => fieldNameLower.includes(word))) {
        score = 40;
        matchType = 'fuzzy';
      }
      // Some search words present
      else {
        const matchingWords = searchWords.filter((word) => fieldNameLower.includes(word)).length;
        if (matchingWords > 0) {
          score = 20 * (matchingWords / searchWords.length);
          matchType = 'fuzzy';
        }
      }

      // Bonus for crop name match
      if (
        cropNameLower.includes(searchLower) ||
        searchWords.some((w) => cropNameLower.includes(w))
      ) {
        score += 10;
      }

      // Bonus for company name match (if searching within company)
      if (companyNameLower.includes(searchLower)) {
        score += 5;
      }

      return { field, score, matchType };
    });

    // Filter out non-matching fields and sort by score
    const matchedFields = scoredFields
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.field);

    // If we have matches, return them (limit to top 10)
    if (matchedFields.length > 0) {
      return matchedFields.slice(0, 10);
    }

    // If no matches, return empty array (agent will ask for clarification)
    return [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find user fields: ${errorMessage}`);
  }
}
