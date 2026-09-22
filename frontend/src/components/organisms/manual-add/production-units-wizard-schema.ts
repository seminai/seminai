import { z } from 'zod';
import type { PostProductionUnitsBulkCreateBodyProductionUnitsItem } from '@/generated/schemas/postProductionUnitsBulkCreateBodyProductionUnitsItem';
import type { ProductionUnitDraft } from '@/components/organisms/manual-add/production-units-wizard-types';

const optionalDate = z.string();

export const productionUnitDetailSchema = z
  .object({
    name: z.string().min(1, 'Nome richiesto'),
    cropCode: z.string().min(1, 'Seleziona una coltura'),
    cropName: z.string().min(1, 'Coltura richiesta'),
    cropType: z.string().min(1, 'Tipo coltura richiesto'),
    variety: z.string().min(1, 'Varietà richiesta'),
    protocoll: z.string().min(1, 'Protocollo richiesto'),
    protectionStructure: z.string().min(1, 'Struttura richiesta'),
    startDate: z.string().min(1, 'Inizio richiesto'),
    floweringDate: optionalDate,
    harvestingDate: optionalDate,
    endDate: z.string().min(1, 'Fine richiesto'),
    acquaTotalePeridoL: z.number().nonnegative().optional().nullable(),
    occupazione: z.string(),
    destinazioneDiUso: z.string(),
  })
  .refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: 'Inizio deve precedere fine',
    path: ['endDate'],
  });

export type ProductionUnitDetailInput = z.input<typeof productionUnitDetailSchema>;
export type ProductionUnitDetailValues = z.output<typeof productionUnitDetailSchema>;

function toIsoOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return new Date(trimmed).toISOString();
}

export function draftToBulkItem(draft: ProductionUnitDraft): PostProductionUnitsBulkCreateBodyProductionUnitsItem {
  return {
    name: draft.name,
    cropName: draft.cropName,
    cropType: draft.cropType,
    variety: draft.variety,
    protocoll: draft.protocoll,
    protectionStructure: draft.protectionStructure,
    startDate: new Date(draft.startDate).toISOString(),
    floweringDate: toIsoOrNull(draft.floweringDate) ?? new Date(draft.startDate).toISOString(),
    harvestingDate: toIsoOrNull(draft.harvestingDate) ?? new Date(draft.endDate).toISOString(),
    endDate: new Date(draft.endDate).toISOString(),
    acquaTotalePeridoL:
      draft.acquaTotalePeridoL != null && Number.isFinite(draft.acquaTotalePeridoL)
        ? draft.acquaTotalePeridoL
        : null,
    occupazione: draft.occupazione.trim() ? draft.occupazione.trim() : null,
    destinazioneDiUso: draft.destinazioneDiUso.trim() ? draft.destinazioneDiUso.trim() : null,
    allocations: draft.allocations.map((a) => ({ fieldId: a.fieldId, areaHa: a.areaHa })),
  };
}
