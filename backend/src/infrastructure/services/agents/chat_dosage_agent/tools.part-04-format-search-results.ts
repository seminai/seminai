import { JobOperationsVectorStore, JobOperationSearchResult } from './rag';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Formats search results for the LLM consumption.
 * Includes operation details and relevance score.
 */
export function formatSearchResults(results: JobOperationSearchResult[]): string {
  if (results.length === 0) {
    return 'Nessuna operazione trovata che corrisponde alla ricerca.';
  }

  const formattedResults = results.map((result, index) => {
    const { document, score } = result;
    const { metadata } = document;
    const scorePercent = Math.round(score * 100);

    return `[OPERAZIONE ${index + 1}] (Rilevanza: ${scorePercent}%)
ID: ${metadata.operationId}
Data: ${new Date(metadata.dateOfOperation).toLocaleDateString('it-IT')}
Categoria: ${metadata.category}
Coltura: ${metadata.cropName} (${metadata.cropType})
Prodotti: ${metadata.productNames.join(', ') || 'N/A'}
Avversità: ${metadata.avversity || 'N/A'}
Quantità: ${metadata.quantity} ${metadata.unitOfMeasure}
Campi: ${metadata.fieldNames.join(', ')}
Azienda: ${metadata.companyName}

Dettagli:
${document.content}
---`;
  });

  return `RISULTATI RICERCA OPERAZIONI (${results.length} trovate):

${formattedResults.join('\n\n')}

NOTA: Questi risultati sono ordinati per rilevanza semantica rispetto alla query.`;
}

/**
 * Creates a tool for semantic search over job operations.
 * This tool uses vector embeddings to find relevant operations
 * based on natural language queries.
 *
 * @param vectorStore - The initialized JobOperationsVectorStore
 */
export const createJobOperationsSearchTool = (vectorStore: JobOperationsVectorStore) => {
  return new DynamicStructuredTool({
    name: 'search_job_operations',
    description: `Cerca tra le operazioni del job corrente usando ricerca semantica.
Usa questo strumento per trovare operazioni specifiche basandoti su:
- Nome del prodotto o principio attivo (es. "rame", "captano", "glifosate")
- Data o periodo (es. "gennaio", "primavera", "ultima settimana")
- Tipo di avversità o malattia (es. "ticchiolatura", "peronospora")
- Tipo di operazione (es. "trattamento", "fertilizzazione")
- Nome del campo o azienda

Esempi di query:
- "trattamenti con rame"
- "operazioni di gennaio 2025"
- "trattamenti contro ticchiolatura"
- "ultimi trattamenti fitosanitari"
- "fertilizzazioni sul campo Vigna Alta"

IMPORTANTE: Usa questo strumento invece di get_job_details quando vuoi cercare operazioni specifiche.`,
    schema: z.object({
      query: z
        .string()
        .describe('La query di ricerca in linguaggio naturale. Può essere in italiano o inglese.'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Numero massimo di risultati da restituire (default: 5, max: 10)'),
    }),
    func: async ({ query, limit = 5 }) => {
      try {
        const results = await vectorStore.search(query, Math.min(limit, 10));
        return formatSearchResults(results);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return `Errore durante la ricerca: ${errorMessage}`;
      }
    },
  });
};
