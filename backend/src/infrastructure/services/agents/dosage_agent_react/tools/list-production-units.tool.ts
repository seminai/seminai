import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { toWorkingMemoryUnit } from './map-units-to-job-input';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tool: list_production_units
 * Lists production units for the current user with crop, area, dates, and field location info.
 * Supports filtering by companyId (UUID) OR companyName (partial, case-insensitive).
 */
export function createListProductionUnitsTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_production_units',
    description: `Elenca le unità di produzione dell'utente con colture, superfici, date e localizzazione dei campi.
Filtri opzionali per azienda (usane al massimo uno):
- companyName: nome parziale dell'azienda (es. "Seminai Fruit") — preferito se non conosci il companyId
- companyId: UUID dell'azienda — solo se già ottenuto da list_user_companies
Filtro opzionale per coltura: cropName (es. "Melo", "Vite").
Salva il risultato in working memory (inputUnits) per i tool successivi del workflow.

IMPORTANTE: Se hai già chiamato questo tool nella stessa conversazione e i dati sono in working memory,
NON richiamare — usa i dati già disponibili. Richiama SOLO se devi applicare filtri diversi.`,
    schema: z.object({
      companyId: z
        .string()
        .optional()
        .describe(
          'UUID dell\'azienda — deve essere il valore "id" ottenuto da list_user_companies. NON usare il nome azienda qui: usa companyName.',
        ),
      companyName: z
        .string()
        .optional()
        .describe(
          'Filtra per nome azienda (ricerca parziale, case-insensitive). Usa questo parametro quando conosci il nome ma non hai ancora l\'UUID (es. "Seminai Fruit").',
        ),
      cropName: z
        .string()
        .optional()
        .describe('Filtra per nome coltura (es. "Melo", "Vite"). Case-insensitive.'),
      forceRefresh: z
        .boolean()
        .optional()
        .default(false)
        .describe('Forza il ricaricamento anche se i dati sono già in working memory.'),
    }),
    func: async ({ companyId, companyName, cropName, forceRefresh }) => {
      const wm = getWorkingMemory(threadId);
      // Default companyId from WM-promoted @company mention when no explicit
      // filter is passed. See list-company-products.tool.ts for rationale.
      if (!companyId && !companyName && wm.currentCompanyId) {
        companyId = wm.currentCompanyId;
      }
      console.log(
        `[list_production_units] called — userId=${userId} companyId=${companyId ?? 'none'} companyName=${companyName ?? 'none'} cropName=${cropName ?? 'none'} forceRefresh=${forceRefresh}`,
      );

      const hasFilter = !!(companyId || companyName || cropName);
      if (!forceRefresh && wm.inputUnits && wm.inputUnits.length > 0 && !hasFilter) {
        return JSON.stringify({
          unitsFound: wm.inputUnits.length,
          cachedFromWorkingMemory: true,
          message: `Working memory contiene già ${wm.inputUnits.length} unità di produzione. Usa questi dati senza richiamare il tool. Per filtrare, passa companyId, companyName o cropName.`,
        });
      }

      // Guard: if companyId is provided, it must be a valid UUID
      if (companyId && !UUID_REGEX.test(companyId)) {
        console.warn(
          `[list_production_units] Invalid companyId: "${companyId}". Use companyName instead.`,
        );
        return JSON.stringify({
          error: `companyId non valido: "${companyId}". Il companyId deve essere un UUID (es. "b136f881-e358-4bbf-8674-1b47c14d8a27"), NON il nome dell'azienda.`,
          suggestion: `Usa companyName="${companyId}" per filtrare per nome, oppure chiama list_user_companies per ottenere l'UUID corretto.`,
        });
      }

      try {
        // Build company filter: by UUID (exact) or by name (partial, case-insensitive)
        const companyFilter: Record<string, unknown> = {
          companyUsers: { some: { userId } },
        };
        if (companyName) {
          companyFilter.name = { contains: companyName, mode: 'insensitive' as const };
        }

        const fieldWhere: Record<string, unknown> = { company: companyFilter };
        if (companyId) {
          fieldWhere.companyId = companyId;
        }

        const results = await prisma.productionUnitOnField.findMany({
          where: {
            field: fieldWhere,
            ...(cropName
              ? {
                  productionUnit: {
                    cycles: {
                      some: {
                        cropName: { contains: cropName, mode: 'insensitive' as const },
                      },
                    },
                  },
                }
              : {}),
          },
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: [
                    { seasonYear: 'desc' },
                    { cycleIndex: 'desc' },
                    { harvestingDate: 'desc' },
                  ],
                  take: 1,
                },
              },
            },
            field: {
              include: {
                company: { select: { id: true, name: true } },
              },
            },
          },
        });

        // Filter out units without cycles and map to summary
        const valid = results.filter((r) => r.productionUnit.cycles.length > 0);

        const mapped = valid.map((r) => {
          const cycle = r.productionUnit.cycles[0];
          return {
            id: r.productionUnit.id,
            name: r.productionUnit.name,
            cropName: cycle.cropName,
            cropType: cycle.cropType,
            variety: cycle.variety,
            areaHa: r.productionUnit.areaHa,
            protocoll: cycle.protocoll,
            startDate: r.productionUnit.startDate?.toISOString() ?? null,
            endDate: r.productionUnit.endDate?.toISOString() ?? null,
            floweringDate: cycle.floweringDate?.toISOString() ?? null,
            harvestingDate: cycle.harvestingDate?.toISOString() ?? null,
            companyId: r.field.company?.id ?? null,
            companyName: r.field.company?.name ?? null,
            field: {
              id: r.field.id,
              name: r.field.name,
              city: r.field.city,
              region: r.field.region,
              sauHa: r.field.sauHa,
              gisHa: r.field.gisHa,
            },
            areaHaOnField: r.areaHaOnField,
          };
        });

        // Populate working memory (deduplicated by production unit id)
        const seen = new Set<string>();
        const uniqueUnits = mapped.filter((u) => {
          if (seen.has(u.id)) return false;
          seen.add(u.id);
          return true;
        });

        updateWorkingMemory(threadId, {
          inputUnits: uniqueUnits.map((unit) =>
            toWorkingMemoryUnit({
              id: unit.id,
              name: unit.name,
              cropName: unit.cropName,
              variety: unit.variety,
              areaHa: unit.areaHa,
              companyId: unit.companyId,
              companyName: unit.companyName,
              startDate: unit.startDate,
              endDate: unit.endDate,
              floweringDate: unit.floweringDate,
              harvestingDate: unit.harvestingDate,
              region: unit.field.region,
              city: unit.field.city,
              field: unit.field,
            }),
          ),
        });

        console.log(
          `[list_production_units] results — total=${results.length} valid=${valid.length} unique=${uniqueUnits.length} userId=${userId} companyId=${companyId ?? 'none'} companyName=${companyName ?? 'none'}`,
        );

        // Count companies for the compact index
        const companyNames = new Set(uniqueUnits.map((u) => u.companyName ?? 'Sconosciuta'));

        const activeFilter = companyId
          ? `companyId="${companyId}"`
          : companyName
            ? `companyName="${companyName}"`
            : null;

        let noResultsMessage = activeFilter
          ? `Nessuna unità di produzione trovata per ${activeFilter}. Verifica il filtro con list_user_companies.`
          : 'Nessuna unità di produzione trovata.';

        if (uniqueUnits.length === 0 && activeFilter) {
          const companyWhere: Record<string, unknown> = {
            companyUsers: { some: { userId } },
          };
          if (companyId) {
            companyWhere.id = companyId;
          }
          if (companyName) {
            companyWhere.name = { contains: companyName, mode: 'insensitive' as const };
          }
          const company = await prisma.company.findFirst({
            where: companyWhere,
            select: {
              id: true,
              name: true,
              _count: { select: { fields: true } },
            },
          });
          if (company) {
            noResultsMessage =
              `Azienda "${company.name}" trovata, ma non risultano unità produttive` +
              (company._count.fields === 0 ? ' o campi registrati' : ' associate ai filtri') +
              ". Non inventare unità produttive: chiedi all'utente di selezionare/importare una unità reale.";
          }
        }

        // Return compact INDEX to the LLM (full data stays in working memory).
        // Sorted by area descending — most relevant first.
        const sorted = [...uniqueUnits].sort((a, b) => (b.areaHa ?? 0) - (a.areaHa ?? 0));

        return JSON.stringify({
          unitsFound: uniqueUnits.length,
          companiesCount: companyNames.size,
          blocked: uniqueUnits.length === 0,
          unitIndex: sorted.slice(0, 15).map((u, i) => ({
            idx: i,
            id: u.id,
            name: u.name,
            crop: u.cropName,
            ha: u.areaHa,
            company: u.companyName,
          })),
          workingMemoryKey: 'inputUnits',
          hint:
            uniqueUnits.length === 0
              ? 'Non procedere con search_products o piani di trattamento finché non esiste una unità produttiva reale con UUID restituito da list_production_units.'
              : undefined,
          message:
            uniqueUnits.length === 0
              ? noResultsMessage
              : `Trovate ${uniqueUnits.length} unità in ${companyNames.size} azienda/e. Dati completi in working memory. Usa get_working_memory_details per dettagli.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error(
          `[list_production_units] error — userId=${userId} companyId=${companyId ?? 'none'} companyName=${companyName ?? 'none'}:`,
          error,
        );
        return JSON.stringify({ error: msg });
      }
    },
  });
}
