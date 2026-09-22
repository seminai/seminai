import { z } from 'zod';
import type { ExtractionSchema, FieldDescriptor } from './types';

const LineSchema = z
  .object({
    productName: z.string().min(1).optional().describe('Nome del prodotto'),
    registrationNumber: z.string().optional().describe('N. di registrazione'),
    // Non-negative: returns/credit notes are tracked separately (type=OUT) — the
    // chat review form is for incoming goods only, so a negative quantity is
    // almost certainly a typo. Zero is allowed for free samples ("omaggio").
    quantity: z.number().nonnegative().optional().describe('Quantità'),
    unitOfMeasure: z.string().optional().describe('Unità di misura'),
    // Non-negative for the same reason; zero is allowed for free samples.
    unitPrice: z.number().nonnegative().optional().describe('Prezzo unitario (€)'),
  })
  .partial();

const Schema = z.object({
  ddtNumber: z.string().min(1).describe('Numero DDT'),
  ddtDate: z.string().min(1).describe('Data DDT (ISO o gg/mm/aaaa)'),
  supplierName: z.string().min(1).describe('Ragione sociale del fornitore'),
  supplierVat: z.string().optional().describe('Partita IVA del fornitore'),
  recipientName: z.string().optional().describe('Destinatario'),
  causale: z.string().optional().describe('Causale del trasporto'),
  carrier: z.string().optional().describe('Vettore'),
  totalLines: z.number().int().nonnegative().optional().describe('N. righe prodotto'),
  notes: z.string().optional().describe('Note libere'),
  lines: z.array(LineSchema).optional().describe('Righe prodotto del DDT'),
});

export type DdtExtractionPayload = z.infer<typeof Schema>;

const LINE_FIELDS: readonly FieldDescriptor[] = [
  { key: 'productName', labelIt: 'Prodotto', type: 'text', required: false },
  { key: 'registrationNumber', labelIt: 'N. Reg.', type: 'text', required: false },
  { key: 'quantity', labelIt: 'Quantità', type: 'number', required: false },
  { key: 'unitOfMeasure', labelIt: 'UDM', type: 'text', required: false },
  { key: 'unitPrice', labelIt: 'Prezzo unit. (€)', type: 'number', required: false },
];

export const ddtSchema: ExtractionSchema<DdtExtractionPayload> = {
  category: 'DDT',
  zodSchema: Schema,
  fields: [
    { key: 'ddtNumber', labelIt: 'Numero DDT', type: 'text', required: true },
    { key: 'ddtDate', labelIt: 'Data DDT', type: 'date', required: true },
    { key: 'supplierName', labelIt: 'Fornitore', type: 'text', required: true },
    { key: 'supplierVat', labelIt: 'P. IVA fornitore', type: 'text', required: false },
    { key: 'recipientName', labelIt: 'Destinatario', type: 'text', required: false },
    { key: 'causale', labelIt: 'Causale trasporto', type: 'text', required: false },
    { key: 'carrier', labelIt: 'Vettore', type: 'text', required: false },
    { key: 'totalLines', labelIt: 'N. righe prodotto', type: 'number', required: false },
    { key: 'notes', labelIt: 'Note', type: 'textarea', required: false },
    {
      key: 'lines',
      labelIt: 'Righe prodotto',
      type: 'lines',
      required: false,
      lineFields: LINE_FIELDS,
    },
  ],
};
