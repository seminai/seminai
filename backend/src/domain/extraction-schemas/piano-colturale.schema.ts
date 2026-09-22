import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  seasonYear: z.number().int().min(1900).describe('Annata agraria'),
  region: z.string().optional().describe('Regione'),
  totalFields: z.number().int().nonnegative().optional().describe('N. campi'),
  totalProductionUnits: z.number().int().nonnegative().optional().describe('N. unità produttive'),
  totalAreaHa: z.number().nonnegative().optional().describe('Superficie totale (ha)'),
  crops: z.string().optional().describe('Colture principali (CSV)'),
  notes: z.string().optional(),
});

export type PianoColturaleExtractionPayload = z.infer<typeof Schema>;

export const pianoColturaleSchema: ExtractionSchema<PianoColturaleExtractionPayload> = {
  category: 'PIANO_COLTURALE',
  zodSchema: Schema,
  fields: [
    { key: 'seasonYear', labelIt: 'Annata agraria', type: 'number', required: true },
    { key: 'region', labelIt: 'Regione', type: 'text', required: false },
    { key: 'totalFields', labelIt: 'N. campi', type: 'number', required: false },
    {
      key: 'totalProductionUnits',
      labelIt: 'N. unità produttive',
      type: 'number',
      required: false,
    },
    { key: 'totalAreaHa', labelIt: 'Superficie totale (ha)', type: 'number', required: false },
    { key: 'crops', labelIt: 'Colture principali', type: 'text', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
