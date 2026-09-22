import { z } from 'zod';
import { LabelDoseDetail, Label } from '../../../../domain/dtos/label.dto';
import { CompleteCycle } from './treatmentDatePlanner';
import { DosageAgentContext } from './context';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import { callWithFallback, extractResponseText } from './llmProvider';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for inferred application timing from LLM
 */
const InferredTimingSchema = z.object({
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
const PlannedApplicationsSchema = z.object({
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

/**
 * Plan specific application dates based on inferred timing and crop cycle.
 * This function takes the inferred timing and the actual crop cycle to produce
 * concrete dates for each application.
 */
export async function planApplicationsFromInferredTiming(
  inferredTiming: InferredTiming,
  cycle: CompleteCycle,
  dosageDetail: LabelDoseDetail,
  productName: string,
  context?: DosageAgentContext,
): Promise<PlannedApplications> {
  const maxApps = dosageDetail.n_max_applicazioni ?? 5;
  const intervalMin = dosageDetail.intervallo_min_giorni ?? 7;
  const safetyDays = dosageDetail.intervallo_sicurezza_giorni ?? 3;

  const phasesText = inferredTiming.recommendedPhases
    .sort((a, b) => b.priority - a.priority)
    .map((p, i) => `${i + 1}. ${p.phase} (priorità ${p.priority}/10): ${p.reason}`)
    .join('\n');

  const prompt = `Sei un agronomo esperto. Devi pianificare DATE CONCRETE per applicare un ${inferredTiming.productType}.

PRODOTTO: ${productName}
COLTURA: ${cycle.cropName} ${cycle.variety || ''}
TIPO PRODOTTO: ${inferredTiming.productType}
MALATTIE TARGET: ${inferredTiming.targetDiseases.join(', ')}
STRATEGIA RACCOMANDATA: ${inferredTiming.applicationStrategy}

CICLO FENOLOGICO DELLA COLTURA:
- Inizio ciclo/Ripresa vegetativa: ${cycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${cycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${cycle.harvestingDate.toISOString().split('T')[0]}
- Fine ciclo: ${cycle.endDate.toISOString().split('T')[0]}

RIFERIMENTI TEMPORALI PER COLTURE ARBOREE (usa come guida per calcolare le date):
- Riposo vegetativo: dicembre-febbraio (prima dell'inizio ciclo)
- Pre-fioritura: 7-21 giorni prima della fioritura
- Allegagione: 7-14 giorni dopo fine fioritura
- Ingrossamento frutti: da allegagione fino a 30-45 giorni prima raccolta
- Invaiatura: 20-40 giorni prima raccolta (varia per coltura)
- Pre-raccolta: rispetta sempre il PHI (intervallo sicurezza)

FASI RACCOMANDATE PER L'APPLICAZIONE (in ordine di priorità):
${phasesText}

VINCOLI DA ETICHETTA:
- Max applicazioni: ${maxApps}
- Intervallo minimo tra applicazioni: ${intervalMin} giorni
- Intervallo di sicurezza pre-raccolta (PHI): ${safetyDays} giorni

ISTRUZIONI:
1. Distribuisci le applicazioni nelle fasi raccomandate, rispettando il numero massimo
2. Calcola le date concrete basandoti sul ciclo fenologico fornito
3. Rispetta SEMPRE l'intervallo minimo tra applicazioni
4. L'ultima applicazione deve essere ALMENO ${safetyDays} giorni prima della raccolta
5. Privilegia le fasi con priorità più alta
6. Se le fasi raccomandate sono più del numero max di applicazioni, scegli le più critiche

Rispondi SOLO in JSON:
{
  "applications": [
    {
      "date": "YYYY-MM-DD",
      "phase": "nome fase fenologica",
      "targetDiseases": ["malattia1", "malattia2"],
      "notes": "Fase fenologica: [fase]. Trattamento per: [malattie]. [altre note]",
      "isLocalized": false
    }
  ],
  "totalApplications": numero,
  "reasoning": "breve spiegazione delle scelte fatte"
}`;

  try {
    const tracker = usageLogger.createTracker();
    const { result, usedModel } = await callWithFallback<PlannedApplications>({
      operation: 'timing-inference',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const json = JSON.parse(cleanedContent);
        return PlannedApplicationsSchema.parse(json);
      },
    });
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'timing-inference-planning' },
    });

    console.log(
      `[TIMING-INFERRER] ${productName}: ${result.totalApplications} applicazioni pianificate. ${result.reasoning}`,
    );

    return result;
  } catch (err) {
    console.error(`[TIMING-INFERRER] Planning failed for ${productName}:`, err);
    return {
      applications: [],
      totalApplications: 0,
      reasoning: 'Errore nella pianificazione',
    };
  }
}

/**
 * Check if a dosage detail needs timing inference (epoca_impiego is null or empty)
 */
export function needsTimingInference(dosageDetail: LabelDoseDetail): boolean {
  const epoca = dosageDetail.epoca_impiego;
  return !epoca || epoca.trim() === '' || epoca.toLowerCase() === 'non specificata';
}

/**
 * Full inference pipeline: infer timing and plan applications
 */
export async function inferAndPlanApplications(
  label: Label,
  dosageDetail: LabelDoseDetail,
  cycle: CompleteCycle,
  context?: DosageAgentContext,
): Promise<PlannedApplications> {
  const productName = label.prodotto || 'Prodotto';
  const cropName = cycle.cropName;

  console.log(
    `[TIMING-INFERRER] Inferring timing for ${productName} on ${cropName} (epoca_impiego not specified)`,
  );

  // Step 1: Infer application timing based on product type and diseases
  const inferredTiming = await inferApplicationTiming(label, dosageDetail, cropName, context);

  if (!inferredTiming) {
    console.warn(`[TIMING-INFERRER] Could not infer timing for ${productName}`);
    return {
      applications: [],
      totalApplications: 0,
      reasoning: 'Impossibile inferire il timing di applicazione',
    };
  }

  // Step 2: Plan concrete application dates
  const plannedApplications = await planApplicationsFromInferredTiming(
    inferredTiming,
    cycle,
    dosageDetail,
    productName,
    context,
  );

  return plannedApplications;
}
