import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  title: z.string().optional().describe('Titolo / sintesi'),
  noteDate: z.string().optional().describe('Data nota'),
  body: z.string().min(1).describe('Contenuto della nota'),
});

export type NotaExtractionPayload = z.infer<typeof Schema>;

export const notaSchema: ExtractionSchema<NotaExtractionPayload> = {
  category: 'NOTA',
  zodSchema: Schema,
  fields: [
    { key: 'title', labelIt: 'Titolo', type: 'text', required: false },
    { key: 'noteDate', labelIt: 'Data', type: 'date', required: false },
    { key: 'body', labelIt: 'Contenuto', type: 'textarea', required: true },
  ],
};
