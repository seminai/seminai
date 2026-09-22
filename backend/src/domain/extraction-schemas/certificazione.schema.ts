import { z } from 'zod';
import type { ExtractionSchema } from './types';

const Schema = z.object({
  scheme: z.string().min(1).describe('Schema di certificazione (BIO/GlobalGAP/IGP/DOP/...)'),
  certifyingBody: z.string().optional().describe('Ente certificatore'),
  certificateNumber: z.string().optional().describe('Numero certificato'),
  issueDate: z.string().optional().describe('Data emissione'),
  expiryDate: z.string().optional().describe('Data scadenza'),
  scope: z.string().optional().describe('Ambito di certificazione'),
  notes: z.string().optional(),
});

export type CertificazioneExtractionPayload = z.infer<typeof Schema>;

export const certificazioneSchema: ExtractionSchema<CertificazioneExtractionPayload> = {
  category: 'CERTIFICAZIONE',
  zodSchema: Schema,
  fields: [
    { key: 'scheme', labelIt: 'Schema', type: 'text', required: true },
    { key: 'certifyingBody', labelIt: 'Ente certificatore', type: 'text', required: false },
    { key: 'certificateNumber', labelIt: 'N. certificato', type: 'text', required: false },
    { key: 'issueDate', labelIt: 'Data emissione', type: 'date', required: false },
    { key: 'expiryDate', labelIt: 'Data scadenza', type: 'date', required: false },
    { key: 'scope', labelIt: 'Ambito', type: 'textarea', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
  ],
};
