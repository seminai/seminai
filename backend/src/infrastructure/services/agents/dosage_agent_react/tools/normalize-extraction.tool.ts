/**
 * Tool: normalize_extraction
 * Deterministic step between extract_from_file and present_extraction_review.
 * Dedups extracted fields against the company's existing fields, marks each
 * field as new/existing/occupied, and groups rows into ProductionUnits keyed
 * by (cropName, comune, foglio, usoSuoloPrimario, usoSuoloSecondario).
 * Non-destructive: read-only on the DB, writes only to working memory.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../../../repositories/PrismaProductionUnitRepository';
import { ExtractionNormalizationService } from '../../../../../application/services/extraction-normalization/ExtractionNormalizationService';
import type { FieldExtracted, ProductionUnitExtracted } from './file-extraction-types';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';

export function createNormalizeExtractionTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'normalize_extraction',
    description: `Normalizza in modo DETERMINISTICO i dati estratti da extract_from_file.
- Deduplica i campi estratti contro quelli esistenti dell'azienda (riferimento catastale).
- Marca ogni campo come 'new', 'existing' o 'occupied' (UP attiva sovrapposta nel periodo).
- Raggruppa le righe in Unità Produttive per (coltura, comune, foglio, uso suolo primario, uso suolo secondario).
NON modifica il database. Scrive solo in working memory (normalizedExtraction).
Richiede companyId valido e wm.extractedFileData già popolato.
Chiamalo SUBITO dopo extract_from_file e prima di present_extraction_review.`,
    schema: z.object({
      companyId: z
        .string()
        .min(1)
        .describe("ID dell'azienda di riferimento per la dedup dei campi esistenti."),
    }),
    func: async ({ companyId }) => {
      const wm = getWorkingMemory(threadId);
      const extracted = wm.extractedFileData;
      if (
        !extracted ||
        !Array.isArray(extracted.fields) ||
        !Array.isArray(extracted.productionUnits)
      ) {
        return JSON.stringify({
          error: 'extractedFileData mancante in working memory. Chiama prima extract_from_file.',
        });
      }
      try {
        const fieldRepo = new PrismaFieldRepository(prisma);
        const puRepo = new PrismaProductionUnitRepository(prisma);
        const service = new ExtractionNormalizationService(fieldRepo, puRepo);
        const normalized = await service.normalize({
          companyId,
          raw: {
            fields: extracted.fields as ReadonlyArray<FieldExtracted>,
            productionUnits: extracted.productionUnits as ReadonlyArray<ProductionUnitExtracted>,
          },
        });
        updateWorkingMemory(threadId, { normalizedExtraction: normalized });
        return JSON.stringify({
          ...normalized.stats,
          workingMemoryKey: 'normalizedExtraction',
          agentMustContinue: true,
          instruction:
            normalized.stats.fieldsOccupied > 0
              ? `Avvisa l'utente: ${normalized.stats.fieldsOccupied} campo/i risultano OCCUPATI da UP attive. Procedi con present_extraction_review così l'utente potrà scegliere (skip / reuse / force_new) per ciascuno.`
              : 'Procedi con present_extraction_review.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: message });
      }
    },
  });
}
