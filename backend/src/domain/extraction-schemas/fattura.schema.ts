import { z } from 'zod';
import type { ExtractionSchema, FieldDescriptor } from './types';

const LineSchema = z
  .object({
    productName: z.string().min(1).optional().describe('Nome del prodotto'),
    registrationNumber: z.string().optional().describe('N. di registrazione'),
    // Non-negative: credit notes / returns are tracked separately (type=OUT).
    // Zero is allowed for free samples ("omaggio").
    quantity: z.number().nonnegative().optional().describe('Quantità'),
    unitOfMeasure: z.string().optional().describe('Unità di misura'),
    unitPrice: z.number().nonnegative().optional().describe('Prezzo unitario (€)'),
  })
  .partial();

const Schema = z.object({
  invoiceNumber: z.string().min(1).describe('Numero fattura'),
  invoiceDate: z.string().min(1).describe('Data fattura'),
  supplierName: z.string().min(1).describe('Ragione sociale del fornitore'),
  supplierVat: z.string().optional().describe('Partita IVA fornitore'),
  totalAmount: z.number().optional().describe('Importo totale (€)'),
  vatAmount: z.number().optional().describe('IVA (€)'),
  totalLines: z.number().int().nonnegative().optional().describe('N. righe prodotto'),
  paymentTerms: z.string().optional().describe('Modalità di pagamento'),
  notes: z.string().optional().describe('Note libere'),
  lines: z.array(LineSchema).optional().describe('Righe prodotto della fattura'),
});

export type FatturaExtractionPayload = z.infer<typeof Schema>;

const LINE_FIELDS: readonly FieldDescriptor[] = [
  { key: 'productName', labelIt: 'Prodotto', type: 'text', required: false },
  { key: 'registrationNumber', labelIt: 'N. Reg.', type: 'text', required: false },
  { key: 'quantity', labelIt: 'Quantità', type: 'number', required: false },
  { key: 'unitOfMeasure', labelIt: 'UDM', type: 'text', required: false },
  { key: 'unitPrice', labelIt: 'Prezzo unit. (€)', type: 'number', required: false },
];

export const fatturaSchema: ExtractionSchema<FatturaExtractionPayload> = {
  category: 'FATTURA',
  zodSchema: Schema,
  fields: [
    { key: 'invoiceNumber', labelIt: 'Numero fattura', type: 'text', required: true },
    { key: 'invoiceDate', labelIt: 'Data fattura', type: 'date', required: true },
    { key: 'supplierName', labelIt: 'Fornitore', type: 'text', required: true },
    { key: 'supplierVat', labelIt: 'P. IVA fornitore', type: 'text', required: false },
    { key: 'totalAmount', labelIt: 'Importo totale (€)', type: 'number', required: false },
    { key: 'vatAmount', labelIt: 'IVA (€)', type: 'number', required: false },
    { key: 'totalLines', labelIt: 'N. righe prodotto', type: 'number', required: false },
    { key: 'paymentTerms', labelIt: 'Modalità pagamento', type: 'text', required: false },
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
