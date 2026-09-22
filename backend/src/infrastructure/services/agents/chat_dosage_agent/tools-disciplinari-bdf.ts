import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DisciplinariPdfVectorStore } from './rag/DisciplinariPdfVectorStore';

/**
 * Creates a tool that performs semantic search over official Italian disciplinari PDFs.
 * PDFs are fetched from BDF (Banca Dati Fitofarmaci) on-demand and cached in memory.
 *
 * Use this tool instead of tavily_scientific_search when you need:
 * - Exact dose limits from a regional disciplinare
 * - Maximum number of interventions per crop/adversity
 * - Phenological window constraints
 * - Active ingredient restrictions from official 2024–2025 documents
 *
 * @param vectorStore Pre-instantiated DisciplinariPdfVectorStore with BDF catalog
 */
export const createDisciplinariPdfSearchTool = (
  vectorStore: DisciplinariPdfVectorStore,
): DynamicStructuredTool => {
  return new DynamicStructuredTool({
    name: 'search_disciplinari_bdf_pdf',
    description: `Searches official Italian disciplinari PDF documents (lotta integrata / produzione integrata) downloaded from BDF.
Use this tool when you need authoritative information from regional disciplinari (2024–2025) about:
- Allowed doses (min/max) for a product or active ingredient on a specific crop
- Maximum number of interventions per season or crop cycle
- Minimum interval between treatments (days)
- Phenological windows (BBCH stages)
- Restrictions on active ingredients or SA groups
- Compliance constraints from official production guidelines

SEARCH STRATEGY:
1. Specify "region" to limit the search to the relevant regional disciplinare.
2. Specify "year" to prefer 2025 or 2024 documents.
3. Use a descriptive "query" including crop, product/active ingredient, and adversity.
4. If no region is specified, the search covers all available documents.

AVAILABLE REGIONS (2024–2025):
Abruzzo, Bacino Centro Sud Italia, Basilicata, Bolzano, Calabria, Campania,
Emilia-Romagna, Friuli Venezia Giulia, Lazio, Liguria, Lombardia, Marche,
Molise, Piemonte, Puglia, Sardegna, Sicilia, Toscana, Trento, Umbria,
Valle D'Aosta, Veneto, Linee Guida Nazionali.

NOTE: The first search for a region/year will trigger a PDF download (15–30 seconds).
Subsequent searches for the same document are instant (in-memory cache).`,
    schema: z.object({
      query: z
        .string()
        .describe(
          'Natural language search query. Include crop name, product/active ingredient, and adversity for best results. Example: "dose massima captano melo ticchiolatura".',
        ),
      region: z
        .string()
        .optional()
        .describe(
          'Italian region name to filter results (e.g. "Emilia-Romagna", "Piemonte", "Veneto"). Leave empty to search all regions.',
        ),
      year: z
        .number()
        .optional()
        .describe('Document year filter: 2025 or 2024. Leave empty for both.'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of result chunks to return (default 5, max 10).'),
    }),
    func: async ({ query, region, year, limit = 5 }) => {
      try {
        const available = vectorStore.listAvailable(region, year);
        if (available.length === 0) {
          return `No disciplinari found for region="${region ?? 'any'}", year=${year ?? 'any'}.
Available regions: Abruzzo, Bacino Centro Sud Italia, Basilicata, Bolzano, Calabria, Campania,
Emilia-Romagna, Friuli Venezia Giulia, Lazio, Liguria, Lombardia, Marche,
Molise, Piemonte, Puglia, Sardegna, Sicilia, Toscana, Trento, Umbria,
Valle D'Aosta, Veneto, Linee Guida Nazionali.`;
        }

        const documentList = available.map((e) => `  • ${e.title}`).join('\n');
        console.log(
          `[search_disciplinari_bdf_pdf] Searching ${available.length} document(s) for query: "${query}"`,
        );

        const results = await vectorStore.search(query, region, year, Math.min(limit, 10));

        if (results.length === 0) {
          return `No relevant content found in disciplinari for query "${query}" (region: ${region ?? 'any'}, year: ${year ?? 'any'}).
Documents searched:
${documentList}
Try broadening the query or removing region/year filters.`;
        }

        const formatted = results
          .map((r, index) => {
            const scorePercent = Math.round(r.score * 100);
            return `[CHUNK_${index + 1}] (Relevance: ${scorePercent}%)
Source: ${r.chunk.metadata.title}
Region: ${r.chunk.metadata.region}
Year: ${r.chunk.metadata.year}
URL: ${r.chunk.metadata.url}
---
${r.chunk.content}
---`;
          })
          .join('\n\n');

        return `DISCIPLINARI BDF PDF SEARCH RESULTS for "${query}":
Documents searched: ${available.length}
${documentList}

${formatted}

IMPORTANT: Cite the source as "${results[0]?.chunk.metadata.title}" when using this information.
These are official Italian production guidelines (lotta integrata). Prefer this data over web searches.`;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return `Error searching disciplinari PDFs: ${msg}. The PDF download may have failed. Try using search_disciplinari_database or tavily_scientific_search instead.`;
      }
    },
  });
};
