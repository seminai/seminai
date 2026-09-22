import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { PrismaProductionUnitRepository } from '../../../../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import {
  CreateProductionUnitUseCase,
  CreateProductionUnitDTO,
} from '../../../../../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { updateWorkingMemory } from '../working-memory';
import { assertFieldsAccess } from './authorization';

interface ExistingUnitSummary {
  readonly id: string;
  readonly name: string;
  readonly cropName: string;
  readonly areaHa: number;
}

function normalizeAllocations(
  allocations: Array<{ fieldId: string; areaHa: number }>,
): ReadonlyArray<string> {
  return allocations
    .map((allocation) => `${allocation.fieldId}:${allocation.areaHa}`)
    .sort((left, right) => left.localeCompare(right));
}

async function findExistingProductionUnit(
  unit: {
    name: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    startDate: string;
    endDate: string;
    allocations: Array<{ fieldId: string; areaHa: number }>;
  },
  userId: string,
): Promise<ExistingUnitSummary | null> {
  const expectedAllocations = normalizeAllocations(unit.allocations);
  const candidates = await prisma.productionUnit.findMany({
    where: {
      name: unit.name,
      startDate: new Date(unit.startDate),
      endDate: new Date(unit.endDate),
      cycles: {
        some: {
          cropName: unit.cropName,
          cropType: unit.cropType,
          variety: unit.variety,
          protocoll: unit.protocoll,
        },
      },
      productionUnitsOnFields: {
        some: { field: { company: { companyUsers: { some: { userId } } } } },
      },
    },
    include: {
      cycles: {
        where: {
          cropName: unit.cropName,
          cropType: unit.cropType,
          variety: unit.variety,
          protocoll: unit.protocoll,
        },
        take: 1,
      },
      productionUnitsOnFields: {
        select: {
          fieldId: true,
          areaHaOnField: true,
        },
      },
    },
  });
  const match = candidates.find((candidate) => {
    const candidateAllocations = normalizeAllocations(
      candidate.productionUnitsOnFields.map((allocation) => ({
        fieldId: allocation.fieldId,
        areaHa: allocation.areaHaOnField,
      })),
    );
    return (
      candidate.cycles.length > 0 &&
      candidateAllocations.length === expectedAllocations.length &&
      candidateAllocations.every((allocation, index) => allocation === expectedAllocations[index])
    );
  });
  if (!match || match.cycles.length === 0) {
    return null;
  }
  return {
    id: match.id,
    name: match.name,
    cropName: match.cycles[0].cropName,
    areaHa: match.areaHa,
  };
}

/**
 * Tool: create_production_units
 * Creates production units in the system with field allocations. REQUIRES USER APPROVAL.
 */
export function createCreateProductionUnitsTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_production_units',
    description: `Crea unità produttive nel sistema con allocazioni sui campi.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Prima di chiamare questo tool, presenta un riepilogo con:
- Nome UP, coltura, varietà, superficie, campo associato, date ciclo
Ogni unità deve avere almeno un'allocazione su un campo esistente.
L'area allocata non deve superare la SAU disponibile del campo.
Richiede fieldId validi — usa create_fields o list_user_fields prima.`,
    schema: z.object({
      units: z
        .array(
          z.object({
            name: z.string().describe('Nome unità produttiva (es. "Vite da vino - Sangiovese")'),
            cropName: z.string().describe('Nome coltura (es. "Vite", "Melo", "Pero")'),
            cropType: z.string().describe('Tipo coltura (es. "Da vino", "Da tavola")'),
            variety: z.string().describe('Varietà (es. "Sangiovese", "Golden Delicious")'),
            protocoll: z
              .string()
              .describe('Protocollo (es. "Convenzionale", "Biologico", "Integrato")'),
            protectionStructure: z
              .string()
              .optional()
              .default('Nessuna')
              .describe('Struttura di protezione (es. "Serra", "Tunnel", "Nessuna")'),
            startDate: z.string().describe('Data inizio ciclo (YYYY-MM-DD)'),
            endDate: z.string().describe('Data fine ciclo (YYYY-MM-DD)'),
            floweringDate: z.string().optional().nullable().describe('Data fioritura (YYYY-MM-DD)'),
            harvestingDate: z.string().optional().nullable().describe('Data raccolta (YYYY-MM-DD)'),
            allocations: z
              .array(
                z.object({
                  fieldId: z.string().describe('ID campo (da create_fields o list_user_fields)'),
                  areaHa: z.number().describe('Ettari allocati su questo campo'),
                }),
              )
              .min(1)
              .describe('Allocazioni sui campi (almeno una)'),
            occupazione: z.string().optional().nullable().describe('Occupazione del suolo'),
            destinazioneDiUso: z.string().optional().nullable().describe("Destinazione d'uso"),
          }),
        )
        .min(1)
        .describe('Lista unità produttive da creare'),
    }),
    func: async ({ units }) => {
      try {
        const puRepo = new PrismaProductionUnitRepository(prisma);
        const fieldRepo = new PrismaFieldRepository(prisma);
        const useCase = new CreateProductionUnitUseCase(puRepo, fieldRepo);

        const createdIds: string[] = [];
        const summaries: Array<{ id: string; name: string; cropName: string; areaHa: number }> = [];
        const errors: Array<{ name: string; error: string }> = [];
        let reusedCount = 0;

        for (const unit of units) {
          try {
            await assertFieldsAccess(
              userId,
              unit.allocations.map((allocation: { fieldId: string }) => allocation.fieldId),
            );
            const existing = await findExistingProductionUnit(unit, userId);
            if (existing) {
              reusedCount++;
              createdIds.push(existing.id);
              summaries.push(existing);
              continue;
            }
            const totalArea = unit.allocations.reduce(
              (sum: number, a: { fieldId: string; areaHa: number }) => sum + a.areaHa,
              0,
            );

            const dto: CreateProductionUnitDTO = {
              name: unit.name,
              cropName: unit.cropName,
              cropType: unit.cropType,
              variety: unit.variety,
              protocoll: unit.protocoll,
              protectionStructure: unit.protectionStructure ?? 'Nessuna',
              areaHa: totalArea,
              startDate: new Date(unit.startDate),
              endDate: new Date(unit.endDate),
              floweringDate: unit.floweringDate
                ? new Date(unit.floweringDate)
                : new Date(unit.startDate),
              harvestingDate: unit.harvestingDate
                ? new Date(unit.harvestingDate)
                : new Date(unit.endDate),
              allocations: unit.allocations.map((a: { fieldId: string; areaHa: number }) => ({
                fieldId: a.fieldId,
                areaHa: a.areaHa,
              })),
              occupazione: unit.occupazione ?? null,
              destinazioneDiUso: unit.destinazioneDiUso ?? null,
              acquaTotalePeridoL: 0,
            };

            const { productionUnit } = await useCase.execute(dto);
            createdIds.push(productionUnit.id);
            summaries.push({
              id: productionUnit.id,
              name: productionUnit.name,
              cropName: productionUnit.cropName,
              areaHa: productionUnit.areaHa,
            });
          } catch (err) {
            errors.push({
              name: unit.name,
              error: err instanceof Error ? err.message : 'Errore sconosciuto',
            });
          }
        }

        updateWorkingMemory(threadId, { createdProductionUnitIds: createdIds });

        return JSON.stringify({
          unitsCreated: createdIds.length,
          unitsReused: reusedCount,
          unitsFailed: errors.length,
          units: summaries,
          errors: errors.length > 0 ? errors : undefined,
          workingMemoryKey: 'createdProductionUnitIds',
          message:
            errors.length === 0
              ? `Create o riutilizzate ${createdIds.length} unità produttive con successo.`
              : `Create o riutilizzate ${createdIds.length} UP, ${errors.length} fallite. Verifica gli errori.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
