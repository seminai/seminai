import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  title: z.string().min(1).describe('Titolo / sintesi del documento'),
  documentDate: z.string().optional().describe('Data del documento (se presente)'),
  summary: z.string().optional().describe('Riepilogo libero del contenuto'),
});

export type AltroExtractionPayload = z.infer<typeof Schema>;

export const altroSchema: ExtractionSchema<AltroExtractionPayload> = {
  category: 'ALTRO',
  zodSchema: Schema,
  fields: [
    { key: 'title', labelIt: 'Titolo', type: 'text', required: true },
    { key: 'documentDate', labelIt: 'Data documento', type: 'date', required: false },
    { key: 'summary', labelIt: 'Riepilogo', type: 'textarea', required: false },
  ],
};
