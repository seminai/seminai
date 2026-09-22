import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaFieldRepository } from '../../../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../../../repositories/PrismaProductionUnitRepository';
import { prisma } from '../../../../repositories/Prisma';
import { UpdateProductionUnitUseCase } from '../../../../../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { assertProductionUnitAccess } from './authorization';

interface WorkingMemoryProductionUnitRef {
  readonly id: string;
  readonly name?: string;
  readonly companyId?: string | null;
  readonly companyName?: string | null;
  readonly cropName?: string;
  readonly variety?: string | null;
  readonly startDate?: Date;
  readonly floweringDate?: Date;
  readonly harvestingDate?: Date;
  readonly endDate?: Date;
  readonly areaHa?: number | null;
}

interface ProductionUnitDateUpdateInput {
  readonly productionUnitId?: string;
  readonly productionUnitName?: string;
  readonly companyId?: string;
  readonly companyName?: string;
  readonly startDate?: string;
  readonly floweringDate?: string;
  readonly harvestingDate?: string;
  readonly endDate?: string;
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format: ${value}`);
  }
  return parsed;
}

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function resolveProductionUnitId(
  threadId: string,
  input: ProductionUnitDateUpdateInput,
): { id: string; name: string } {
  if (input.productionUnitId) {
    return { id: input.productionUnitId, name: input.productionUnitName ?? input.productionUnitId };
  }
  if (!input.productionUnitName) {
    throw new Error('productionUnitId o productionUnitName obbligatorio per ogni aggiornamento.');
  }
  const workingMemoryUnits = (getWorkingMemory(threadId).inputUnits ??
    []) as WorkingMemoryProductionUnitRef[];
  const matchingUnits = workingMemoryUnits.filter((unit) => {
    if (normalizeText(unit.name) !== normalizeText(input.productionUnitName)) {
      return false;
    }
    if (input.companyId && unit.companyId !== input.companyId) {
      return false;
    }
    if (input.companyName && normalizeText(unit.companyName) !== normalizeText(input.companyName)) {
      return false;
    }
    return true;
  });
  if (matchingUnits.length === 1) {
    return { id: matchingUnits[0].id, name: matchingUnits[0].name ?? input.productionUnitName };
  }
  if (matchingUnits.length > 1) {
    throw new Error(
      `Unità produttiva "${input.productionUnitName}" ambigua. Specifica productionUnitId o companyName/companyId.`,
    );
  }
  throw new Error(
    `Unità produttiva "${input.productionUnitName}" non trovata in working memory. Esegui prima list_production_units o specifica productionUnitId.`,
  );
}

function syncWorkingMemoryDates(
  threadId: string,
  updatedUnits: Array<{
    id: string;
    startDate?: Date | null;
    floweringDate?: Date | null;
    harvestingDate?: Date | null;
    endDate?: Date | null;
  }>,
): void {
  const memory = getWorkingMemory(threadId);
  const existingUnits = (memory.inputUnits ?? []) as WorkingMemoryProductionUnitRef[];
  if (existingUnits.length === 0) {
    return;
  }
  const updatedById = new Map(updatedUnits.map((unit) => [unit.id, unit]));
  const nextUnits = existingUnits.map((unit) => {
    const updated = updatedById.get(unit.id);
    if (!updated) {
      return unit;
    }
    return {
      ...unit,
      startDate: updated.startDate ?? unit.startDate,
      floweringDate: updated.floweringDate ?? unit.floweringDate,
      harvestingDate: updated.harvestingDate ?? unit.harvestingDate,
      endDate: updated.endDate ?? unit.endDate,
    };
  });
  updateWorkingMemory(threadId, { inputUnits: nextUnits });
}

/**
 * Tool: update_production_units
 * Updates basic production-unit dates without entering the treatment-planning workflow.
 */
export function createUpdateProductionUnitsTool(
  threadId: string,
  userId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'update_production_units',
    description: `Aggiorna le date base di unità produttive esistenti.
⚠️ QUESTO TOOL RICHIEDE APPROVAZIONE ESPLICITA DELL'UTENTE.
Usa questo tool per richieste anagrafiche semplici sulle unità produttive (es. correggere start/end/flowering/harvesting).
NON usare questo tool per piani di trattamento: per quelli usa generate_treatment_plan / modify_plan_step.
Puoi identificare le unità con productionUnitId oppure con productionUnitName (meglio se dopo list_production_units).
Se l'utente vuole correggere più unità produttive, usa UNA SOLA chiamata con TUTTE le modifiche dentro "updates".`,
    schema: z.object({
      updates: z
        .array(
          z.object({
            productionUnitId: z.string().optional().describe('UUID dell’unità produttiva'),
            productionUnitName: z
              .string()
              .optional()
              .describe('Nome esatto dell’unità produttiva, se non hai l’UUID'),
            companyId: z.string().optional().describe('UUID azienda per disambiguare il nome'),
            companyName: z.string().optional().describe('Nome azienda per disambiguare il nome'),
            startDate: z.string().optional().describe('Nuova data inizio (ISO 8601)'),
            floweringDate: z.string().optional().describe('Nuova data fioritura (ISO 8601)'),
            harvestingDate: z.string().optional().describe('Nuova data raccolta (ISO 8601)'),
            endDate: z.string().optional().describe('Nuova data fine (ISO 8601)'),
          }),
        )
        .min(1)
        .describe('Lista delle unità produttive da aggiornare'),
      reason: z
        .string()
        .describe('Motivo della modifica, da presentare chiaramente anche nel riepilogo utente'),
    }),
    func: async ({ updates, reason }) => {
      try {
        const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
        const useCase = new UpdateProductionUnitUseCase(
          productionUnitRepository,
          new PrismaFieldRepository(prisma),
        );
        const updatedUnits: Array<{
          id: string;
          name: string;
          cropName: string;
          variety: string;
          startDate: string | null;
          floweringDate: string | null;
          harvestingDate: string | null;
          endDate: string | null;
        }> = [];
        for (const input of updates as ProductionUnitDateUpdateInput[]) {
          const resolved = resolveProductionUnitId(threadId, input);
          await assertProductionUnitAccess(userId, resolved.id);
          const existingProductionUnit = await productionUnitRepository.findById(resolved.id);
          if (!existingProductionUnit) {
            throw new Error(`Unità produttiva "${resolved.name}" non trovata.`);
          }
          const data = {
            startDate: parseOptionalDate(input.startDate),
            floweringDate: parseOptionalDate(input.floweringDate),
            harvestingDate: parseOptionalDate(input.harvestingDate),
            endDate: parseOptionalDate(input.endDate),
          };
          if (!data.startDate && !data.floweringDate && !data.harvestingDate && !data.endDate) {
            throw new Error(
              `Nessuna data da aggiornare per l'unità produttiva "${resolved.name}".`,
            );
          }
          const isNoOp =
            (!data.startDate ||
              existingProductionUnit.startDate?.toISOString() === data.startDate.toISOString()) &&
            (!data.floweringDate ||
              existingProductionUnit.floweringDate?.toISOString() ===
                data.floweringDate.toISOString()) &&
            (!data.harvestingDate ||
              existingProductionUnit.harvestingDate?.toISOString() ===
                data.harvestingDate.toISOString()) &&
            (!data.endDate ||
              existingProductionUnit.endDate?.toISOString() === data.endDate.toISOString());
          if (isNoOp) {
            updatedUnits.push({
              id: existingProductionUnit.id,
              name: existingProductionUnit.name,
              cropName: existingProductionUnit.cropName,
              variety: existingProductionUnit.variety,
              startDate: existingProductionUnit.startDate?.toISOString() ?? null,
              floweringDate: existingProductionUnit.floweringDate?.toISOString() ?? null,
              harvestingDate: existingProductionUnit.harvestingDate?.toISOString() ?? null,
              endDate: existingProductionUnit.endDate?.toISOString() ?? null,
            });
            continue;
          }
          console.log(
            `[update_production_units] updating id=${resolved.id} name="${resolved.name}" startDate=${input.startDate ?? 'unchanged'} floweringDate=${input.floweringDate ?? 'unchanged'} harvestingDate=${input.harvestingDate ?? 'unchanged'} endDate=${input.endDate ?? 'unchanged'}`,
          );
          const { productionUnit } = await useCase.execute({
            id: resolved.id,
            data,
          });
          updatedUnits.push({
            id: productionUnit.id,
            name: productionUnit.name,
            cropName: productionUnit.cropName,
            variety: productionUnit.variety,
            startDate: productionUnit.startDate?.toISOString() ?? null,
            floweringDate: productionUnit.floweringDate?.toISOString() ?? null,
            harvestingDate: productionUnit.harvestingDate?.toISOString() ?? null,
            endDate: productionUnit.endDate?.toISOString() ?? null,
          });
        }
        syncWorkingMemoryDates(
          threadId,
          updatedUnits.map((unit) => ({
            id: unit.id,
            startDate: unit.startDate ? new Date(unit.startDate) : null,
            floweringDate: unit.floweringDate ? new Date(unit.floweringDate) : null,
            harvestingDate: unit.harvestingDate ? new Date(unit.harvestingDate) : null,
            endDate: unit.endDate ? new Date(unit.endDate) : null,
          })),
        );
        return JSON.stringify({
          updatedCount: updatedUnits.length,
          updatedUnits,
          reason,
          message:
            `Aggiornate ${updatedUnits.length} unità produttive. ` +
            'Modifica completata: non chiamare di nuovo update_production_units in questo turno. ' +
            'Rispondi all’utente con un riepilogo finale delle unità aggiornate.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Errore sconosciuto';
        console.error('[update_production_units] error:', error);
        return JSON.stringify({ error: message });
      }
    },
  });
}
