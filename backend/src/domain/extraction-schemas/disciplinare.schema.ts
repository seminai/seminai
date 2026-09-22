import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  title: z.string().min(1).describe('Titolo disciplinare'),
  region: z.string().optional().describe('Regione di riferimento'),
  year: z.number().int().optional().describe('Anno disciplinare'),
  crop: z.string().optional().describe('Coltura/colture coperte'),
  issuingAuthority: z.string().optional().describe('Ente emittente'),
  notes: z.string().optional().describe('Note'),
});

export type DisciplinareExtractionPayload = z.infer<typeof Schema>;

export const disciplinareSchema: ExtractionSchema<DisciplinareExtractionPayload> = {
  category: 'DISCIPLINARE',
  zodSchema: Schema,
  fields: [
    { key: 'title', labelIt: 'Titolo', type: 'text', required: true },
    { key: 'region', labelIt: 'Regione', type: 'text', required: false },
    { key: 'year', labelIt: 'Anno', type: 'number', required: false },
    { key: 'crop', labelIt: 'Coltura', type: 'text', required: false },
    { key: 'issuingAuthority', labelIt: 'Ente emittente', type: 'text', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
