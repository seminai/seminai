import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { z } from 'zod';
import { LabelDoseDetail, Label } from '../../../../domain/dtos/label.dto';
import { DosageAgentContext } from './context';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';

export const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for inferred application timing from LLM
 */
export const InferredTimingSchema = z.object({
  productType: z
    .string()
    .describe('Tipo di prodotto: fungicida, insetticida, erbicida, acaricida, etc.'),
  targetDiseases: z.array(z.string()).describe('Malattie/avversità target'),
  recommendedPhases: z.array(
    z.object({
      phase: z.string().describe('Fase fenologica (es. pre-fioritura, fioritura, allegagione)'),
      reason: z.string().describe('Motivo agronomico per questa fase'),
      priority: z.number().min(1).max(10).describe('Priorità 1-10, dove 10 è più critico'),
    }),
  ),
  applicationStrategy: z.string().describe('Strategia di applicazione consigliata'),
});

export type InferredTiming = z.infer<typeof InferredTimingSchema>;

/**
 * Infer application timing using LLM when epoca_impiego is not specified in the label.
 * The LLM analyzes:
 * - Product type (fungicide, insecticide, herbicide, etc.)
 * - Target diseases/pests
 * - Crop phenological cycle
 * - Best agronomic practices for disease/pest control
 */
export async function inferApplicationTiming(
  label: Label,
  dosageDetail: LabelDoseDetail,
  cropName: string,
  context?: DosageAgentContext,
): Promise<InferredTiming | null> {
  const productName = label.prodotto || 'Prodotto sconosciuto';
  const category = label.categoria || 'Non specificata';
  const activeIngredient = label.principio_attivo || 'Non specificato';
  const diseases = dosageDetail.malattia || label.malattie?.join(', ') || 'Non specificate';
  const applicationMode = dosageDetail.modalita_applicazione || 'Non specificata';
  const maxApplications = dosageDetail.n_max_applicazioni || 'Non specificato';

  const prompt = `Sei un agronomo esperto. Devi determinare QUANDO applicare un prodotto fitosanitario su una coltura, dato che l'etichetta NON specifica l'epoca di impiego.

PRODOTTO: ${productName}
CATEGORIA: ${category}
PRINCIPIO ATTIVO: ${activeIngredient}
MODALITÀ APPLICAZIONE (da etichetta): ${applicationMode}
MALATTIE/AVVERSITÀ TARGET: ${diseases}
COLTURA: ${cropName}
N. MAX APPLICAZIONI: ${maxApplications}

ISTRUZIONI DA ETICHETTA: ${dosageDetail.istruzioni || 'Nessuna'}

COMPITO:
1. Identifica il TIPO di prodotto (fungicida, insetticida, erbicida, acaricida, etc.) dalla categoria e principio attivo
2. Analizza le MALATTIE/AVVERSITÀ target elencate
3. Basandoti sulla tua conoscenza agronomica, determina IN QUALI FASI FENOLOGICHE della coltura ${cropName} è più efficace/necessario applicare questo prodotto per controllare le malattie indicate
4. Considera:
   - Quando si manifestano tipicamente queste malattie/avversità
   - Quando la pianta è più vulnerabile
   - Se il trattamento deve essere preventivo o curativo
   - Il ciclo biologico dei patogeni/parassiti

FASI FENOLOGICHE TIPICHE (usa queste come riferimento in base al tipo di coltura):

COLTURE ERBACEE ANNUALI (orticole, cereali):
- Germinazione/Emergenza
- Sviluppo vegetativo
- Pre-fioritura avanzata
- Fioritura
- Allegagione
- Allegagione piena
- Inizio ingrossamento frutti
- Ingrossamento frutti
- Invaiatura
- Maturazione
- Pre-raccolta

VITE:
- Riposo vegetativo (gemme dormienti, inverno)
- Pianto (fuoriuscita linfa, fine inverno)
- Germogliamento/Rottura gemme
- Foglie distese (2-3 foglie)
- Grappoli visibili
- Grappoli separati
- Bottoni fiorali separati
- Pre-fioritura
- Fioritura
- Allegagione
- Acini a grano di pepe
- Chiusura grappolo
- Invaiatura (cambio colore acini)
- Maturazione
- Vendemmia
- Post-vendemmia/Caduta foglie

POMACEE (melo, pero, cotogno):
- Riposo vegetativo
- Rigonfiamento gemme
- Punte verdi
- Orecchiette di topo
- Mazzetti affioranti
- Bottoni rosa (melo) / bottoni bianchi (pero)
- Fioritura
- Caduta petali
- Allegagione
- Frutto noce
- Ingrossamento frutti
- Pre-raccolta
- Maturazione

DRUPACEE (pesco, albicocco, ciliegio, susino):
- Riposo vegetativo
- Rigonfiamento gemme
- Bottoni rosa/bianchi
- Fioritura
- Caduta petali
- Scamiciatura
- Indurimento nocciolo
- Ingrossamento frutti
- Invaiatura
- Pre-raccolta
- Maturazione

OLIVO:
- Riposo vegetativo
- Ripresa vegetativa
- Mignolatura (formazione infiorescenze)
- Pre-fioritura
- Fioritura
- Allegagione
- Indurimento nocciolo
- Accrescimento drupa
- Invaiatura
- Maturazione
- Raccolta

AGRUMI (arancio, limone, mandarino):
- Riposo vegetativo
- Ripresa vegetativa/Germogliamento
- Bottoni fiorali
- Fioritura
- Allegagione
- Cascola fisiologica
- Ingrossamento frutti
- Invaiatura
- Maturazione

ACTINIDIA (kiwi):
- Riposo vegetativo
- Pianto
- Germogliamento
- Foglie distese
- Bottoni fiorali
- Fioritura
- Allegagione
- Ingrossamento frutti
- Maturazione

NOCCIOLO/NOCE/CASTAGNO:
- Riposo vegetativo
- Fioritura maschile (amenti)
- Fioritura femminile
- Fogliazione
- Allegagione
- Ingrossamento frutti
- Maturazione

Rispondi SOLO in JSON con questo formato esatto:
{
  "productType": "fungicida|insetticida|erbicida|acaricida|etc",
  "targetDiseases": ["malattia1", "malattia2"],
  "recommendedPhases": [
    {"phase": "nome fase", "reason": "motivo agronomico", "priority": 8}
  ],
  "applicationStrategy": "breve descrizione della strategia raccomandata"
}`;

  try {
    const tracker = usageLogger.createTracker();
    const { result, usedModel } = await callWithFallback<InferredTiming>({
      operation: 'timing-inference',
      context,
      modelOptions: { temperature: 1 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const json = JSON.parse(cleanedContent);
        return InferredTimingSchema.parse(json);
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'timing-inference-llm' },
    });

    console.log(
      `[TIMING-INFERRER] ${productName} su ${cropName}: ${result.productType}, fasi raccomandate: ${result.recommendedPhases.map((p) => p.phase).join(', ')}`,
    );

    return result;
  } catch (err) {
    console.error(`[TIMING-INFERRER] LLM failed for ${productName}:`, err);
    return null;
  }
}

/**
 * Schema for planned applications based on inferred timing
 */
export const PlannedApplicationsSchema = z.object({
  applications: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      phase: z.string(),
      targetDiseases: z.array(z.string()),
      notes: z.string(),
      isLocalized: z.boolean(),
    }),
  ),
  totalApplications: z.number(),
  reasoning: z.string(),
});

export type PlannedApplications = z.infer<typeof PlannedApplicationsSchema>;
