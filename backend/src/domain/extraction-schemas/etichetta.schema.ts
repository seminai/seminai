import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  productName: z.string().min(1).describe('Nome commerciale del prodotto'),
  registrationNumber: z.string().optional().describe('Numero di registrazione ministeriale'),
  activeSubstance: z.string().optional().describe('Principio attivo'),
  manufacturer: z.string().optional().describe('Produttore / titolare'),
  category: z.string().optional().describe('Categoria (fitofarmaco / fertilizzante)'),
  doseRange: z.string().optional().describe('Dose etichetta (es. "0.8-1.2 kg/ha")'),
  phiDays: z.number().int().nonnegative().optional().describe('Intervallo di sicurezza (giorni)'),
  notes: z.string().optional(),
});

export type EtichettaExtractionPayload = z.infer<typeof Schema>;

export const etichettaSchema: ExtractionSchema<EtichettaExtractionPayload> = {
  category: 'ETICHETTA',
  zodSchema: Schema,
  fields: [
    { key: 'productName', labelIt: 'Nome prodotto', type: 'text', required: true },
    { key: 'registrationNumber', labelIt: 'N. registrazione', type: 'text', required: false },
    { key: 'activeSubstance', labelIt: 'Principio attivo', type: 'text', required: false },
    { key: 'manufacturer', labelIt: 'Produttore', type: 'text', required: false },
    { key: 'category', labelIt: 'Categoria', type: 'text', required: false },
    { key: 'doseRange', labelIt: 'Dose etichetta', type: 'text', required: false },
    { key: 'phiDays', labelIt: 'PHI (giorni)', type: 'number', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
