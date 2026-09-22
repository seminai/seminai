import { Annotation } from '@langchain/langgraph';
import type { AgentTask, SourceCitation, PendingAction, MessageMetadata } from './types';
import { BaseMessage } from '@langchain/core/messages';
import { JobWithAssignmentDTO } from '../../../../domain/dtos/job-assignment.dto';
import { ContextManager } from './context-manager';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { type ChatModelName } from '../../llm-model-validation';


export const usageLogger = LlmUsageLogger.getInstance();


export type ChatModel = ChatModelName;


/**
 * Maximum number of agent iterations before forcing completion.
 */
export const MAX_AGENT_ITERATIONS = 15;


/**
 * Context manager for handling token limits
 */
export const contextManager = new ContextManager({
  maxContextTokens: 100000, // Leave headroom for 128K models
  targetTokensAfterTrim: 70000,
  maxToolResultTokens: 3000,
  preserveSystemMessages: true,
  minRecentMessages: 8,
});


export function parseTaskPlanFromContent(content: string): AgentTask[] {
  const fallback: AgentTask[] = [
    {
      id: 'task_1',
      description: "Rispondere alla richiesta dell'utente",
      status: 'pending',
    },
  ];
  const trimmed = content.trim();
  const withoutCodeFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const candidates = [withoutCodeFence, trimmed];
  const jsonMatch = withoutCodeFence.match(/\[[\s\S]*\]/);
  if (jsonMatch) candidates.push(jsonMatch[0]);
  let lastParseError: string | null = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      const tasks: AgentTask[] = [];
      for (const [index, item] of parsed.entries()) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const description = typeof row.description === 'string' ? row.description.trim() : '';
        if (!description) continue;
        tasks.push({
          id: typeof row.id === 'string' && row.id.trim().length > 0 ? row.id : `task_${index + 1}`,
          description,
          status: 'pending',
        });
      }
      if (tasks.length > 0) return tasks;
    } catch (error) {
      lastParseError = error instanceof Error ? error.message : String(error);
    }
  }
  if (lastParseError) {
    console.warn('[JOB-VERIFICATION-AGENT] Task plan parse failed:', lastParseError);
  }
  return fallback;
}


/**
 * Managed message reducer that trims context when needed
 */
export function managedMessageReducer(existing: BaseMessage[], incoming: BaseMessage[]): BaseMessage[] {
  const combined = existing.concat(incoming);

  // Check if we need to trim
  if (contextManager.needsTrimming(combined)) {
    console.log(`[GRAPH] Context overflow detected, trimming messages...`);
    return contextManager.trimMessages(combined);
  }

  return combined;
}


/**
 * State annotation for the LangGraph workflow.
 */
export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: managedMessageReducer,
    default: () => [],
  }),
  jobs: Annotation<JobWithAssignmentDTO[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  tasks: Annotation<AgentTask[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  currentTaskId: Annotation<string | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
  pendingAction: Annotation<PendingAction | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
  sources: Annotation<SourceCitation[]>({
    reducer: (x, y) => {
      const existingUrls = new Set(x.map((s) => s.url));
      const newSources = y.filter((s) => !existingUrls.has(s.url));
      return [...x, ...newSources];
    },
    default: () => [],
  }),
  reasoning: Annotation<string | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
  finalAnswer: Annotation<string | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
  requiresHumanInput: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  metadata: Annotation<MessageMetadata | undefined>({
    reducer: (_, y) => y,
    default: () => undefined,
  }),
  // Counter to prevent infinite loops
  iterationCount: Annotation<number>({
    reducer: (x, y) => (y !== undefined ? y : x + 1),
    default: () => 0,
  }),
});


/**
 * System prompt for the job verification agent.
 */
export const SYSTEM_PROMPT = `Sei un assistente esperto nella verifica di operazioni agricole (job) per il quaderno di campagna digitale.

CONTESTO:
- Riceverai job da verificare con dati su prodotto, quantità, coltura, ecc.
- L'utente ti farà domande sui job

DATI GIÀ DISPONIBILI NEL JOB:
I job contengono già molte informazioni nei campi:
- **note**: Reasoning del calcolo della dose
- **alertNotes**: Dati dall'etichetta (dose_minima, dose_massima, principio_attivo, epoca_impiego, frasi_pericolo, resistenze, fasce_di_rispetto_e_deriva, etc.)
- **history**: Cronologia decisioni (crop_matching, dosage_scheduling, dosage_optimization)

TOOL DISPONIBILI:
1. **list_job_paths**: Elenca i path disponibili nel job
2. **inspect_job_data**: Legge valori specifici (es. "note", "alertNotes.dose_minima")
3. **tavily_search**: Ricerca web - USA per domande su disciplinari/SQNPI/regolamenti
4. **search_disciplinari**: Cerca nei disciplinari regionali
5. **extract_label_data**: Estrae dati dall'etichetta
6. **bdf_search_product_doses**: Cerca dosi ufficiali di un prodotto per coltura/avversità nella Banca Dati Fitofarmaci
7. **bdf_search_products_by_adversity**: Cerca prodotti autorizzati per coltura/avversità nella BDF

COME RISPONDERE:

Per domande sui DATI DEL JOB (quantità, calcoli, ecc.):
1. Usa inspect_job_data per leggere "note" e "alertNotes" e "history"
2. Rispondi basandoti sui dati trovati

Per domande su CONFORMITÀ/DISCIPLINARI/SQNPI:
1. Prima ispeziona i dati del job
2. POI usa tavily_search con query specifica
3. Se il prodotto è un fitofarmaco/PESTICIDE, DEVI cercare anche per principio attivo:
   - usa il nome prodotto E il principio attivo (es. "AGIL propaquizafop disciplinare SQNPI Emilia Romagna")
   - se ci sono più prodotti, fai una ricerca per ciascun prodotto
   - se trovi un documento del prodotto, verifica che citi il principio attivo corretto
4. Rispondi citando le fonti trovate

Per domande su DOSI UFFICIALI o PRODOTTI AUTORIZZATI:
1. Usa bdf_search_product_doses per trovare le dosi autorizzate di un prodotto specifico
2. Usa bdf_search_products_by_adversity per trovare quali prodotti sono autorizzati
3. I dati BDF sono ufficiali e aggiornati dal Ministero della Salute
4. Se BDF non è disponibile (errore con fallbackHint), usa tavily_search o search_disciplinari come fallback

⚠️ FORMATO RISPOSTA - MOLTO IMPORTANTE:
- NON usare MAI gli ID tecnici (es. "ad5685e3-0bd6-4017-b561-e40f400008a0")
- USA SEMPRE nomi leggibili: nome prodotto, nome azienda, nome unità produttiva
- Per ogni operazione indica:
  * Nome prodotto (es. "AGIL", "CORUM")
  * Azienda (es. "Azienda Demo")
  * Unità produttiva (es. "ERBA MEDICA")
  * Coltura (es. "Medicago sativa")
  * Quantità e dose (es. "1.28 L totali, dose 1.25 L/ha")
  * Motivazioni TECNICHE agronomiche chiare
  * Stadio fenologico BBCH se disponibile
  * Principio attivo

Esempio risposta corretta:
"**Prodotto: CORUM** (Azienda: Azienda Demo, Unità: ERBA MEDICA)
- Coltura: Medicago sativa (erba medica)
- Dose: 1.25 L/ha (totale 1.28 L per 1.03 ha)
- Stadio: BBCH 31-51 (inizio allungamento fusti)
- Principio attivo: Bentazone + Imazamox
- Motivazione: Erbicida selettivo per controllo infestanti dicotiledoni in post-emergenza"

🔴 VERIFICA CONFORMITÀ - ISTRUZIONI CRITICHE:
Quando verifichi la conformità di un prodotto ai disciplinari, DEVI SEMPRE:

1. **CONFRONTARE i valori**: Confronta i dati del job con i limiti del disciplinare
2. **SPIEGARE il motivo**: Se NON CONFORME, indica ESATTAMENTE quale parametro viola il disciplinare

PARAMETRI DA VERIFICARE e COME SPIEGARLI:
- **Dose**: "Dose applicata X L/ha vs limite disciplinare Y-Z L/ha" → conforme/non conforme
- **N. interventi**: "Intervento n. X su max Y consentiti per ciclo/anno"
- **Intervallo tra trattamenti**: "Giorni dall'ultimo trattamento X vs minimo Y giorni richiesti"
- **Finestra fenologica**: "Stadio BBCH X vs finestra consentita BBCH Y-Z"
- **Coltura autorizzata**: "Prodotto autorizzato/non autorizzato su questa coltura"
- **Principio attivo**: "Principio attivo X consentito/non consentito nel disciplinare"
- **Vincoli specifici**: Eventuali restrizioni (es. solo in serra, max kg rame/anno, etc.)

ESEMPIO RISPOSTA NON CONFORMITÀ:
"**Prodotto: BASIRAM ELITE** - ❌ NON CONFORME al disciplinare Piemonte 2025

📋 **Dettaglio verifica conformità:**
| Parametro | Valore applicato | Limite disciplinare | Esito |
|-----------|------------------|---------------------|-------|
| Dose | 3.75 L/ha | 3.50-4.00 L/ha | ✅ Conforme |
| N. interventi | 5° intervento | Max 4/anno | ❌ NON CONFORME |
| Intervallo | 5 giorni | Min 7 giorni | ❌ NON CONFORME |

🔴 **Motivo non conformità:**
- Superato il numero massimo di interventi (5 vs max 4 consentiti)
- Intervallo tra trattamenti insufficiente (5 giorni vs minimo 7 richiesti)

📚 Fonte: Disciplinare Produzione Integrata Piemonte 2025"

ESEMPIO RISPOSTA CONFORMITÀ:
"**Prodotto: ZOXIUM 240 SC** - ✅ CONFORME al disciplinare Piemonte 2025

📋 **Dettaglio verifica conformità:**
| Parametro | Valore applicato | Limite disciplinare | Esito |
|-----------|------------------|---------------------|-------|
| Dose | 0.69 L/ha | 0.63-0.75 L/ha | ✅ Conforme |
| N. interventi | 2° intervento | Max 3/anno | ✅ Conforme |
| Coltura | Pomodoro | Autorizzato | ✅ Conforme |

📚 Fonte: Disciplinare Produzione Integrata Piemonte 2025"

IMPORTANTE:
- Quando hai raccolto abbastanza informazioni, RISPONDI direttamente
- Non continuare a chiamare tool all'infinito
- Cita le fonti quando usi dati da ricerche web
- Se i dati del disciplinare non sono disponibili, indicalo chiaramente`;


/**
 * Default recursion limit for the graph execution.
 * Increase if needed for complex workflows with multiple tool calls.
 */
export const DEFAULT_RECURSION_LIMIT = 50;
