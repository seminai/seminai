import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  companyName: z.string().min(1).describe('Ragione sociale'),
  vatNumber: z.string().optional().describe('Partita IVA'),
  fiscalCode: z.string().optional().describe('Codice fiscale'),
  reaNumber: z.string().optional().describe('Numero REA'),
  legalAddress: z.string().optional().describe('Sede legale'),
  activityCode: z.string().optional().describe('Codice ATECO'),
  notes: z.string().optional(),
});

export type VisuraExtractionPayload = z.infer<typeof Schema>;

export const visuraAziendaleSchema: ExtractionSchema<VisuraExtractionPayload> = {
  category: 'VISURA_AZIENDALE',
  zodSchema: Schema,
  fields: [
    { key: 'companyName', labelIt: 'Ragione sociale', type: 'text', required: true },
    { key: 'vatNumber', labelIt: 'P. IVA', type: 'text', required: false },
    { key: 'fiscalCode', labelIt: 'Codice fiscale', type: 'text', required: false },
    { key: 'reaNumber', labelIt: 'N. REA', type: 'text', required: false },
    { key: 'legalAddress', labelIt: 'Sede legale', type: 'text', required: false },
    { key: 'activityCode', labelIt: 'Codice ATECO', type: 'text', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
