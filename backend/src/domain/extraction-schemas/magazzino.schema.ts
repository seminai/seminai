import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  warehouseName: z.string().optional().describe('Nome magazzino'),
  reportDate: z.string().optional().describe('Data report'),
  totalItems: z.number().int().nonnegative().optional().describe('N. articoli in giacenza'),
  movementType: z
    .enum(['carico', 'scarico', 'inventario', 'rettifica'])
    .optional()
    .describe('Tipo movimento principale'),
  notes: z.string().optional(),
});

export type MagazzinoExtractionPayload = z.infer<typeof Schema>;

export const magazzinoSchema: ExtractionSchema<MagazzinoExtractionPayload> = {
  category: 'MAGAZZINO',
  zodSchema: Schema,
  fields: [
    { key: 'warehouseName', labelIt: 'Nome magazzino', type: 'text', required: false },
    { key: 'reportDate', labelIt: 'Data report', type: 'date', required: false },
    { key: 'totalItems', labelIt: 'N. articoli', type: 'number', required: false },
    {
      key: 'movementType',
      labelIt: 'Tipo movimento',
      type: 'text',
      required: false,
      helpIt: 'carico | scarico | inventario | rettifica',
    },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
