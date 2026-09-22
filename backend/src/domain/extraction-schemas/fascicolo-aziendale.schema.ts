import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  companyName: z.string().min(1).describe('Ragione sociale'),
  vatNumber: z.string().optional().describe('Partita IVA'),
  fiscalCode: z.string().optional().describe('Codice fiscale'),
  cuaa: z.string().optional().describe('CUAA'),
  region: z.string().optional().describe('Regione'),
  totalParcels: z.number().int().nonnegative().optional().describe('Numero particelle catastali'),
  totalSau: z.number().nonnegative().optional().describe('SAU totale (ha)'),
  referenceDate: z.string().optional().describe('Data di riferimento'),
  notes: z.string().optional(),
});

export type FascicoloExtractionPayload = z.infer<typeof Schema>;

export const fascicoloAziendaleSchema: ExtractionSchema<FascicoloExtractionPayload> = {
  category: 'FASCICOLO_AZIENDALE',
  zodSchema: Schema,
  fields: [
    { key: 'companyName', labelIt: 'Ragione sociale', type: 'text', required: true },
    { key: 'vatNumber', labelIt: 'P. IVA', type: 'text', required: false },
    { key: 'fiscalCode', labelIt: 'Codice fiscale', type: 'text', required: false },
    { key: 'cuaa', labelIt: 'CUAA', type: 'text', required: false },
    { key: 'region', labelIt: 'Regione', type: 'text', required: false },
    { key: 'totalParcels', labelIt: 'N. particelle', type: 'number', required: false },
    { key: 'totalSau', labelIt: 'SAU totale (ha)', type: 'number', required: false },
    { key: 'referenceDate', labelIt: 'Data riferimento', type: 'date', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
