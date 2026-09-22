import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  extractFieldBufferZones,
  type FieldBufferZoneResult,
} from '../../dosage_agent/fieldBufferZoneExtractor';
import { updateWorkingMemory } from '../working-memory';

/**
 * Tool: extract_buffer_zones
 * Extracts buffer zone requirements from field descriptions.
 */
export function createExtractBufferZonesTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'extract_buffer_zones',
    description: `Estrae le fasce di rispetto (buffer zones) dalle note descrittive dei campi.
Identifica corsi d'acqua, centri abitati, parchi, colture adiacenti, strade.
Calcola l'area totale non trattabile e riduce la superficie effettiva.
Salva il risultato in working memory (bufferZones).`,
    schema: z.object({
      bufferZoneNotes: z
        .string()
        .describe(
          'Testo descrittivo del campo con informazioni su fasce di rispetto (es. "Confina con fosso a nord, 5m di fascia").',
        ),
    }),
    func: async ({ bufferZoneNotes }) => {
      try {
        const result: FieldBufferZoneResult = await extractFieldBufferZones(bufferZoneNotes);

        updateWorkingMemory(threadId, {
          bufferZones: [result],
        });

        return JSON.stringify({
          bufferZones: result.buffer_zones.map((bz) => ({
            tipo: bz.tipo,
            area_ha: bz.area_ha,
            distanza_m: bz.distanza_m,
            descrizione: bz.descrizione_originale,
          })),
          areaTotaleNonTrattabile_ha: result.area_totale_non_trattabile_ha,
          workingMemoryKey: 'bufferZones',
          message: `Trovate ${result.buffer_zones.length} fasce di rispetto. Area non trattabile: ${result.area_totale_non_trattabile_ha} ha.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
