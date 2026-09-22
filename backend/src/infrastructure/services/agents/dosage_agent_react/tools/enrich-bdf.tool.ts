import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { enrichDosageDetailsFromBdf } from '../../dosage_agent/bdfDosageEnricher';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaLabelExtractionRepository } from '../../../../repositories/PrismaLabelExtractionRepository';
import { isFitoLabel, Label, LabelDoseDetail } from '../../../../../domain/dtos/label.dto';

/**
 * Merges existing dosage details with DB label dosages.
 * Existing data takes priority; DB fills gaps in missing fields.
 */
function mergeWithDbDosages(
  existing: ReadonlyArray<Record<string, unknown>>,
  dbDosaggi: ReadonlyArray<LabelDoseDetail>,
): ReadonlyArray<Record<string, unknown>> {
  if (existing.length === 0) {
    return dbDosaggi as unknown as ReadonlyArray<Record<string, unknown>>;
  }

  return existing.map((entry) => {
    // Only merge when we have a confident disease match.
    // Falling back to an arbitrary record would risk injecting dosage data
    // for a completely different disease (e.g., oidium doses for peronospora).
    const match = dbDosaggi.find(
      (d) =>
        d.malattia &&
        entry.malattia &&
        typeof entry.malattia === 'string' &&
        d.malattia.toLowerCase().includes((entry.malattia as string).toLowerCase()),
    );

    if (!match) return entry;

    const merged = { ...entry };
    const fillableFields: Array<keyof LabelDoseDetail> = [
      'dose_minima',
      'dose_massima',
      'dose_um',
      'n_max_applicazioni',
      'n_max_applicazioni_um',
      'intervallo_min_giorni',
      'intervallo_sicurezza_giorni',
      'epoca_impiego',
      'modalita_applicazione',
    ];

    for (const field of fillableFields) {
      if (merged[field] == null && match[field] != null) {
        merged[field] = match[field];
      }
    }

    return merged;
  });
}

/**
 * Tool: enrich_from_bdf
 * Enriches dosage details using a dual-source strategy:
 * 1. First checks the internal DB for stored ministerial labels (richer data)
 * 2. Falls back to BDF API if DB label not found or incomplete
 */
export function createEnrichBdfTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'enrich_from_bdf',
    description: `Arricchisce i dati di dosaggio cercando PRIMA nel database etichette ministeriali, poi nella Banca Dati Fitofarmaci (BDF).
Completa campi mancanti nell'etichetta: n_max_applicazioni, intervallo_min_giorni, dose_min/max, epoca_impiego, modalità_applicazione.
Se l'etichetta non ha dati di dosaggio, li cerca nel database o nella BDF.
Usa search_product_label_database per dati completi; usa questo tool per arricchire dati parziali.`,
    schema: z.object({
      registrationNumber: z.string().describe('Numero di registrazione del prodotto'),
      productName: z.string().describe('Nome commerciale del prodotto'),
      cropName: z.string().describe('Nome della coltura (es. "Melo", "Vite da uva da vino")'),
      existingDosageDetails: z
        .array(z.record(z.string(), z.unknown()))
        .optional()
        .default([])
        .describe(
          'Dati di dosaggio esistenti da arricchire. Se vuoto, verranno cercati nel database o nella BDF.',
        ),
    }),
    func: async ({ registrationNumber, productName, cropName, existingDosageDetails }) => {
      try {
        // Step 1: Try DB label first (richer data, no external API call)
        const repo = new PrismaLabelExtractionRepository(prisma);
        const dbResults = await repo.searchByProductName({
          productName,
          registrationNumber,
          limit: 1,
        });

        if (dbResults.length > 0 && isFitoLabel(dbResults[0].label)) {
          const label = dbResults[0].label as Label;
          const cropLower = cropName.toLowerCase();
          const cropDosaggi = label.dosaggi_dettagliati.filter(
            (d) =>
              d.coltura.toLowerCase().includes(cropLower) ||
              cropLower.includes(d.coltura.toLowerCase()),
          );

          if (cropDosaggi.length > 0) {
            const enriched = mergeWithDbDosages(existingDosageDetails, cropDosaggi);

            const summary = enriched.map((d: any) => ({
              coltura: d.coltura ?? cropName,
              dose_min: d.dose_minima,
              dose_max: d.dose_massima,
              dose_um: d.dose_um,
              n_max_applicazioni: d.n_max_applicazioni,
              intervallo_min_giorni: d.intervallo_min_giorni,
              intervallo_sicurezza_giorni: d.intervallo_sicurezza_giorni,
              epoca_impiego: d.epoca_impiego,
              modalita_applicazione: d.modalita_applicazione,
            }));

            return JSON.stringify({
              enrichedCount: enriched.length,
              dosageDetails: summary,
              source: 'etichetta_ministeriale_db',
              message: `Dati etichetta DB arricchiti per ${productName} su ${cropName}: ${enriched.length} record.`,
            });
          }
        }

        // Step 2: Fallback to BDF API
        const enriched = await enrichDosageDetailsFromBdf(
          existingDosageDetails as any,
          registrationNumber,
          productName,
          cropName,
        );

        if (enriched.length === 0) {
          return JSON.stringify({
            message:
              'Nessun dato trovato nel database etichette né nella BDF per questo prodotto/coltura.',
            registrationNumber,
            productName,
            cropName,
          });
        }

        const summary = enriched.map((d: any) => ({
          coltura: d.coltura ?? cropName,
          dose_min: d.dose_minima,
          dose_max: d.dose_massima,
          dose_um: d.dose_um ?? d.dosaggio_um,
          n_max_applicazioni: d.n_max_applicazioni,
          intervallo_min_giorni: d.intervallo_min_giorni,
          intervallo_sicurezza_giorni: d.intervallo_sicurezza_giorni,
          epoca_impiego: d.epoca_impiego,
          modalita_applicazione: d.modalita_applicazione,
        }));

        return JSON.stringify({
          enrichedCount: enriched.length,
          dosageDetails: summary,
          source: 'bdf_api',
          message: `Dati BDF arricchiti per ${productName} su ${cropName}: ${enriched.length} record.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({
          error: msg,
          recommendation:
            'BDF non raggiungibile. Usare search_product_label_database o search_disciplinari_database.',
        });
      }
    },
  });
}
