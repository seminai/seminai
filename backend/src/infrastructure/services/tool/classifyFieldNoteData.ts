import { z } from 'zod';
import { hasChatLlmApiKey } from '../llm-config';
import { createChatModel } from '../llm-model-factory';

/**
 * Classification result from the LLM.
 */
export interface FieldNoteClassificationResult {
  category: 'OPERATION' | 'OBSERVATION' | 'MEASUREMENT' | 'HARVEST' | 'MAINTENANCE' | 'OTHER';
  extractedData: {
    recognizedProducts: Array<{
      name: string;
      quantity: number | null;
      unit: string | null;
      confidence: number;
    }>;
    recognizedField: {
      name: string;
      confidence: number;
    } | null;
    recognizedProductionUnit: {
      name: string;
      confidence: number;
    } | null;
    recognizedOperation: {
      type: string;
      description: string;
    } | null;
    recognizedObservations: Array<{
      type: string;
      name: string;
      severity: string | null;
      confidence: number;
    }>;
    extractedQuantities: Array<{
      value: number;
      unit: string;
      context: string;
      type: 'product_quantity' | 'treated_area' | 'other';
    }>;
  };
  confidence: number;
  reasoning: string;
}

const ClassificationSchema = z.object({
  category: z
    .enum(['OPERATION', 'OBSERVATION', 'MEASUREMENT', 'HARVEST', 'MAINTENANCE', 'OTHER'])
    .describe('La categoria della nota di campo'),
  extractedData: z.object({
    recognizedProducts: z
      .array(
        z.object({
          name: z.string().describe('Nome del prodotto'),
          quantity: z.number().nullable().describe('Quantità (null se non specificata)'),
          unit: z.string().nullable().describe('Unità di misura (null se non specificata)'),
          confidence: z.number().min(0).max(1).describe('Confidenza 0-1'),
        }),
      )
      .describe('Prodotti menzionati nel testo (array vuoto se nessuno)'),
    recognizedField: z
      .object({
        name: z.string().describe('Nome del campo'),
        confidence: z.number().min(0).max(1).describe('Confidenza 0-1'),
      })
      .nullable()
      .describe('Campo menzionato (null se non menzionato)'),
    recognizedProductionUnit: z
      .object({
        name: z.string().describe('Nome unità produttiva'),
        confidence: z.number().min(0).max(1).describe('Confidenza 0-1'),
      })
      .nullable()
      .describe('Unità produttiva menzionata (null se non menzionata)'),
    recognizedOperation: z
      .object({
        type: z.string().describe('Tipo operazione'),
        description: z.string().describe('Descrizione operazione'),
      })
      .nullable()
      .describe('Operazione descritta (null se non presente)'),
    recognizedObservations: z
      .array(
        z.object({
          type: z.string().describe('Tipo osservazione'),
          name: z.string().describe('Nome (es: peronospora)'),
          severity: z.string().nullable().describe('Gravità (null se non specificata)'),
          confidence: z.number().min(0).max(1).describe('Confidenza 0-1'),
        }),
      )
      .describe('Osservazioni (array vuoto se nessuna)'),
    extractedQuantities: z
      .array(
        z.object({
          value: z.number().describe('Valore numerico'),
          unit: z.string().describe('Unità di misura'),
          context: z.string().describe('Contesto della quantità'),
          type: z
            .enum(['product_quantity', 'treated_area', 'other'])
            .describe(
              'Tipo: product_quantity per dosi prodotto, treated_area per superfici trattate, other per altro',
            ),
        }),
      )
      .describe('Quantità estratte dal testo (array vuoto se nessuna)'),
  }),
  confidence: z.number().min(0).max(1).describe('Confidenza complessiva della classificazione'),
  reasoning: z.string().describe('Spiegazione del ragionamento'),
});

/**
 * Classifies field note data using GPT-4o LLM.
 * Extracts structured information from free-text field notes.
 */
export async function classifyFieldNoteData(params: {
  rawContent: string;
  operationDate?: string;
  openAIApiKey?: string;
}): Promise<FieldNoteClassificationResult> {
  const { rawContent, operationDate } = params;
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is required for field note classification');
  }
  const { model } = createChatModel({
    modelName: 'gpt-4o',
    temperature: 0.1,
  });

  const structuredModel = model.withStructuredOutput(ClassificationSchema);

  const systemPrompt = `Sei un esperto classificatore di note di campo agricole.

Il tuo compito è analizzare il testo libero scritto da un agricoltore e estrarre informazioni strutturate.

CATEGORIE DISPONIBILI:
- OPERATION: Operazioni agronomiche (trattamenti, semina, concimazione, etc.)
- OBSERVATION: Osservazioni su malattie, parassiti, condizioni delle piante
- MEASUREMENT: Misurazioni (umidità, temperature, pH, etc.)
- HARVEST: Operazioni di raccolta
- MAINTENANCE: Manutenzione di attrezzature o strutture
- OTHER: Altro

ISTRUZIONI:
1. Identifica la categoria principale della nota
2. Estrai tutti i prodotti menzionati con quantità e unità di misura
3. Identifica il campo o l'unità produttiva menzionati
4. Estrai l'operazione descritta
5. Identifica eventuali osservazioni su malattie/parassiti
6. Assegna un confidence score (0-1) per ogni elemento estratto

ESTRAZIONE QUANTITA - IMPORTANTE:
Per ogni quantità estratta, assegna il type corretto:
- "product_quantity": quantità di prodotto applicato (es: "3 kg di rame", "10 litri di fitofarmaco")
- "treated_area": superficie/area trattata (es: "su 2 ettari", "in 3 ha", "su metà campo")
- "other": altre quantità (es: temperature, pH, conteggi)

APPLICAZIONI PARZIALI:
- L'utente può specificare un'area trattata diversa dall'area totale dell'unità produttiva
- Esempi: "ho dato 3 kg di rame su 2 ettari in vite 1" significa che sono stati trattati 2 ettari
- Riconosci espressioni come: "su X ettari", "in X ha", "su metà campo", "su una parte"
- Converti sempre le unità di superficie in ettari (ha) quando possibile

IMPORTANTE:
- Sii preciso nell'estrazione di quantità e unità
- Se un'informazione non è presente, non inventarla
- Il confidence score deve riflettere quanto sei sicuro dell'estrazione
- Normalizza i nomi dei prodotti (es: "rame" invece di "prodotto a base di rame")`;

  const userPrompt = `Analizza questa nota di campo e estrai le informazioni strutturate:

Testo: "${rawContent}"
${operationDate ? `Data operazione: ${operationDate}` : ''}

Restituisci le informazioni estratte in formato JSON strutturato.`;

  try {
    const result = await structuredModel.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return result as FieldNoteClassificationResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to classify field note data: ${errorMessage}`);
  }
}
