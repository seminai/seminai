import { StateGraph, END, START, MemorySaver, Annotation } from '@langchain/langgraph';
import type { ChatOpenAI } from '@langchain/openai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import type { AgentTask, SourceCitation, PendingAction, MessageMetadata } from './types';
import {
  createTavilySearchTool,
  createLabelExtractionTool,
  createDisciplinariSearchTool,
  createVectorSearchTool,
  createJobDetailsTool,
  createProposeJobModificationTool,
  createInspectJobDataTool,
  createListJobPathsTool,
  extractSourcesFromToolContent,
} from './tools';
import {
  createCachedBdfClient,
  createBdfSearchProductDosesTool,
  createBdfSearchProductsByAdversityTool,
} from '../../integrations/bdf';
import {
  BaseMessage,
  AIMessage,
  SystemMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { JobWithAssignmentDTO } from '../../../../domain/dtos/job-assignment.dto';
import { ContextManager, truncateToolResult } from './context-manager';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createChatModel } from '../../llm-model-factory';
import {
  VALID_CHAT_MODELS,
  type ChatModelName,
  isValidChatModelName,
} from '../../llm-model-validation';

const usageLogger = LlmUsageLogger.getInstance();

export type ChatModel = ChatModelName;
export { VALID_CHAT_MODELS };

/**
 * Maximum number of agent iterations before forcing completion.
 */
const MAX_AGENT_ITERATIONS = 15;

/**
 * Context manager for handling token limits
 */
const contextManager = new ContextManager({
  maxContextTokens: 100000, // Leave headroom for 128K models
  targetTokensAfterTrim: 70000,
  maxToolResultTokens: 3000,
  preserveSystemMessages: true,
  minRecentMessages: 8,
});

function parseTaskPlanFromContent(content: string): AgentTask[] {
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
function managedMessageReducer(existing: BaseMessage[], incoming: BaseMessage[]): BaseMessage[] {
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
const StateAnnotation = Annotation.Root({
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
const SYSTEM_PROMPT = `Sei un assistente esperto nella verifica di operazioni agricole (job) per il quaderno di campagna digitale.

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
 * Factory class for creating the LangGraph agent workflow.
 * Implements human-in-the-loop pattern with interrupt before tool execution.
 */
export class JobVerificationGraphFactory {
  private readonly model: ChatOpenAI;
  private readonly tavilyApiKey?: string;
  private readonly userId?: string;
  private readonly modelName: string;

  constructor(
    options: {
      modelName?: ChatModel;
      temperature?: number;
      tavilyApiKey?: string;
      openAIApiKey?: string;
      userId?: string;
    } = {},
  ) {
    const modelName = options.modelName || 'gpt-4o';
    if (!isValidChatModelName(modelName)) {
      throw new Error(
        `Invalid model name: ${modelName}. Must be one of: ${VALID_CHAT_MODELS.join(', ')}`,
      );
    }

    const created = createChatModel({
      modelName,
      temperature: options.temperature ?? 0,
    });

    this.tavilyApiKey = options.tavilyApiKey || process.env.TAVILY_API_KEY;
    this.userId = options.userId;
    this.model = created.model;
    this.modelName = created.modelName;
  }

  /**
   * Creates and compiles the LangGraph workflow with human-in-the-loop support.
   */
  public createGraph() {
    // Tools will be created dynamically with job context in the agent node
    const staticTools: StructuredTool[] = [];

    if (this.tavilyApiKey) {
      staticTools.push(createTavilySearchTool(this.tavilyApiKey));
    }

    staticTools.push(createLabelExtractionTool(this.userId));
    staticTools.push(createDisciplinariSearchTool());
    staticTools.push(createVectorSearchTool());

    // BDF official database tools (if credentials available)
    const bdfBaseUrl = process.env.URL_SERVER_BDF;
    const bdfUsername = process.env.USERNAME_BDF;
    const bdfPassword = process.env.PASSWORD_BDF;
    if (bdfBaseUrl && bdfUsername && bdfPassword) {
      const bdfClient = createCachedBdfClient();
      staticTools.push(
        createBdfSearchProductDosesTool(bdfClient),
        createBdfSearchProductsByAdversityTool(bdfClient),
      );
    }

    staticTools.push(createProposeJobModificationTool());

    if (this.userId) {
      staticTools.push(createJobDetailsTool(this.userId));
    }

    // We'll create dynamic tools (inspect_job_data, list_job_paths) in the agent node
    // since they need access to the jobs from state

    // 2. Define Nodes

    /**
     * Request optimizer node.
     * Analyzes and optimizes the user's request.
     * Passes full job data context for inspection.
     */
    const optimizeRequestNode = async (
      state: typeof StateAnnotation.State,
    ): Promise<Partial<typeof StateAnnotation.State>> => {
      const { messages, jobs } = state;

      // Create a summary for quick reference but tell agent to use tools for details
      const jobsSummary = jobs.map((j) => ({
        id: j.job.id,
        date: j.job.dateOfOpeation,
        category: j.job.category,
        quantity: `${j.job.quantity} ${j.job.unitOfMeasureQuantity}`,
        productionUnit: j.productionUnit.name,
        crop: `${j.productionUnit.cropName} (${j.productionUnit.cropType})`,
        products: j.products.map((p) => `${p.name} (${p.registrationNumber || 'N/A'})`),
        isVerified: j.job.isVerified,
        conformityChecked: j.job.conformityChecked,
        // Indicate what nested data is available
        hasAlertNotes: !!j.job.alertNotes,
        hasHistory: !!(j.job.history && Array.isArray(j.job.history) && j.job.history.length > 0),
        hasNote: !!j.job.note,
      }));

      const contextMessage = new SystemMessage(
        `${SYSTEM_PROMPT}

JOBS DA VERIFICARE (Summary - usa i tool per i dettagli):
${JSON.stringify(jobsSummary, null, 2)}

IMPORTANTE: Per ogni job con hasAlertNotes=true, hasHistory=true, o hasNote=true ci sono dati annidati.
USA SEMPRE i tool list_job_paths e inspect_job_data per leggere questi dati prima di rispondere!`,
      );

      // Check if system message already exists
      const hasSystemMessage = messages.some((msg) => msg instanceof SystemMessage);

      return {
        messages: hasSystemMessage ? [] : [contextMessage],
      };
    };

    /**
     * Task planner node.
     * Creates a list of tasks to solve the problem.
     */
    const planTasksNode = async (
      state: typeof StateAnnotation.State,
    ): Promise<Partial<typeof StateAnnotation.State>> => {
      const { messages } = state;

      const plannerPrompt = new HumanMessage(
        `Basandoti sulla conversazione, crea un piano di azione.
Rispondi con un JSON array di task, ogni task con: {"id": "task_N", "description": "cosa fare"}
Se la richiesta è semplice, puoi avere anche un solo task.
Rispondi SOLO con il JSON array.`,
      );

      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const response = await this.model.invoke([...messages, plannerPrompt], {
        callbacks: [usageCollector],
      });

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(usageAccumulator, {
          userId: this.userId,
          jobType: LlmJobType.JOB_VERIFICATION,
          model: this.modelName,
          metadata: { step: 'job-verification-plan-tasks' },
        })
        .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

      const content = response.content.toString();
      const tasks = parseTaskPlanFromContent(content);

      return {
        tasks,
        currentTaskId: tasks.length > 0 ? tasks[0].id : undefined,
      };
    };

    /**
     * Agent reasoning node.
     * Processes the current task and decides whether to use tools or respond directly.
     * Creates dynamic tools with job context for inspection.
     */
    const agentNode = async (
      state: typeof StateAnnotation.State,
    ): Promise<Partial<typeof StateAnnotation.State>> => {
      const { messages, tasks, currentTaskId, jobs, iterationCount } = state;

      // Increment iteration counter
      const newIterationCount = iterationCount + 1;
      console.log(`[AGENT] Iteration ${newIterationCount}/${MAX_AGENT_ITERATIONS}`);

      // Create dynamic tools with job context
      const dynamicTools: StructuredTool[] = [
        ...staticTools,
        createInspectJobDataTool(jobs as unknown as { job: Record<string, unknown> }[]),
        createListJobPathsTool(jobs as unknown as { job: Record<string, unknown> }[]),
      ];

      const modelWithTools = this.model.bindTools(dynamicTools);

      const currentTask = tasks.find((t) => t.id === currentTaskId);
      const taskContext = currentTask ? `\n\nTASK CORRENTE: ${currentTask.description}` : '';

      // Update current task to in_progress
      let updatedTasks = tasks;
      if (currentTask && currentTask.status === 'pending') {
        updatedTasks = tasks.map((t) =>
          t.id === currentTaskId ? { ...t, status: 'in_progress' as const } : t,
        );
      }

      const agentPrompt = new HumanMessage(
        `${taskContext}\n\nEsegui il task. Usa i tool se necessario, poi rispondi.`,
      );

      const agentUsageAccumulator = new UsageAccumulator();
      const agentUsageCollector = new LangChainUsageCollector(agentUsageAccumulator);
      const response = await modelWithTools.invoke([...messages, agentPrompt], {
        callbacks: [agentUsageCollector],
      });

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(agentUsageAccumulator, {
          userId: this.userId,
          jobType: LlmJobType.JOB_VERIFICATION,
          model: this.modelName,
          metadata: { step: 'job-verification-agent', iteration: newIterationCount },
        })
        .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

      const aiMessage = response as AIMessage & {
        tool_calls?: Array<{
          name: string;
          args: Record<string, unknown>;
          id: string;
        }>;
      };

      // If the agent wants to use tools, store pending action for streaming visibility
      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        const toolCall = aiMessage.tool_calls[0];

        // Check if it's a modification proposal
        const isModification = toolCall.name === 'propose_job_modification';

        // For inspection tools, don't require human input
        const isInspectionTool = ['inspect_job_data', 'list_job_paths'].includes(toolCall.name);

        return {
          messages: [response],
          tasks: updatedTasks,
          pendingAction: {
            type: isModification ? 'job_modification' : 'tool_call',
            tool: toolCall.name,
            args: toolCall.args,
            description: isModification
              ? `Modifica proposta: ${JSON.stringify(toolCall.args)}`
              : isInspectionTool
                ? `Ispeziono dati: ${toolCall.name}(${JSON.stringify(toolCall.args)})`
                : `Esecuzione tool ${toolCall.name}`,
          },
          requiresHumanInput: isModification,
          reasoning: isInspectionTool
            ? `Sto esplorando i dati del job per trovare le informazioni richieste...`
            : undefined,
          iterationCount: newIterationCount,
        };
      }

      // Update task status to completed
      const finalTasks = updatedTasks.map((t) =>
        t.id === currentTaskId ? { ...t, status: 'completed' as const } : t,
      );

      // Find next pending task
      const nextTask = finalTasks.find((t) => t.status === 'pending');

      return {
        messages: [response],
        tasks: finalTasks,
        currentTaskId: nextTask?.id,
        pendingAction: undefined,
        iterationCount: newIterationCount,
      };
    };

    /**
     * Tool execution node with source extraction and result truncation.
     * Creates dynamic tools with job context for inspection.
     * Truncates large tool results to prevent context overflow.
     */
    const toolNodeWithSources = async (
      state: typeof StateAnnotation.State,
    ): Promise<Partial<typeof StateAnnotation.State>> => {
      const { jobs, pendingAction } = state;

      // Create dynamic tools with job context
      const dynamicTools: StructuredTool[] = [
        ...staticTools,
        createInspectJobDataTool(jobs as unknown as { job: Record<string, unknown> }[]),
        createListJobPathsTool(jobs as unknown as { job: Record<string, unknown> }[]),
      ];

      const toolNode = new ToolNode(dynamicTools);
      const result = await toolNode.invoke(state);

      // Extract sources and truncate tool messages to prevent context overflow
      const newSources: SourceCitation[] = [];
      const truncatedMessages: BaseMessage[] = [];

      for (const msg of result.messages || []) {
        if (msg instanceof ToolMessage) {
          const content = msg.content.toString();

          // Extract sources before truncation
          const extracted = extractSourcesFromToolContent(content);
          newSources.push(...extracted);

          // Truncate large tool results
          const truncatedContent = truncateToolResult(content, 3000);

          // Create new ToolMessage with truncated content
          const truncatedMsg = new ToolMessage({
            content: truncatedContent,
            tool_call_id: msg.tool_call_id,
            name: msg.name,
          });
          truncatedMessages.push(truncatedMsg);
        } else {
          truncatedMessages.push(msg);
        }
      }

      // Update reasoning based on tool used
      let reasoning = state.reasoning;
      if (pendingAction?.tool) {
        const toolName = pendingAction.tool;
        if (toolName === 'list_job_paths') {
          reasoning = 'Ho elencato i path disponibili nel job. Ora ispezionerò i dati specifici...';
        } else if (toolName === 'inspect_job_data') {
          const path = (pendingAction.args as { path?: string })?.path || '';
          reasoning = `Ho letto i dati dal path "${path}". Continuo l'analisi...`;
        } else if (toolName === 'extract_label_data') {
          reasoning = "Ho estratto i dati dall'etichetta del prodotto.";
        } else if (toolName === 'tavily_search') {
          reasoning = 'Ho cercato informazioni aggiuntive sul web.';
        } else if (toolName === 'bdf_search_product_doses') {
          reasoning = 'Ho cercato le dosi ufficiali nella Banca Dati Fitofarmaci.';
        } else if (toolName === 'bdf_search_products_by_adversity') {
          reasoning = 'Ho cercato i prodotti autorizzati nella Banca Dati Fitofarmaci.';
        }
      }

      return {
        messages: truncatedMessages,
        sources: newSources,
        pendingAction: undefined,
        reasoning,
      };
    };

    /**
     * Reasoning and answer generation node.
     */
    const generateAnswerNode = async (
      state: typeof StateAnnotation.State,
    ): Promise<Partial<typeof StateAnnotation.State>> => {
      const { messages, sources, jobs } = state;

      // Find original user question for context
      const userMessages = messages.filter((m) => m instanceof HumanMessage);
      const originalQuestion = userMessages.length > 0 ? userMessages[0].content.toString() : '';

      // Build job context with human-readable names
      const jobContext = jobs
        .map((j) => {
          const productNames = j.products?.map((p) => p.name).join(', ') || 'N/A';
          return `- ${productNames} (Azienda: ${j.company?.name || 'N/A'}, Unità: ${j.productionUnit?.name || 'N/A'}, Coltura: ${j.productionUnit?.cropName || 'N/A'})`;
        })
        .join('\n');

      const answerPrompt = new HumanMessage(
        `Genera una risposta finale basata su tutto il lavoro svolto.

DOMANDA ORIGINALE DELL'UTENTE: "${originalQuestion}"

JOB ANALIZZATI (usa questi nomi nella risposta, MAI gli ID):
${jobContext}

REGOLE:
1. Rispondi DIRETTAMENTE alla domanda dell'utente
2. Sii conciso ma completo
3. Se hai usato fonti esterne (tavily_search, search_disciplinari), CITA LE FONTI con URL
4. Se hai proposto modifiche, ricorda all'utente che deve approvarle
5. Mostra i dati che supportano la risposta

⚠️ FORMATO OBBLIGATORIO:
- NON usare MAI gli ID tecnici (come "ad5685e3-0bd6-4017...")
- USA SEMPRE: nome prodotto, azienda, unità produttiva
- Per ogni operazione indica: dose (L/ha), quantità totale, stadio BBCH, principio attivo
- Spiega le motivazioni TECNICHE agronomiche in modo chiaro

🔴 SE LA DOMANDA RIGUARDA CONFORMITÀ/DISCIPLINARI:
DEVI indicare SPECIFICAMENTE:
1. **Esito**: ✅ CONFORME o ❌ NON CONFORME
2. **Tabella comparativa**: confronto tra valori applicati e limiti del disciplinare
3. **Motivo**: se non conforme, quale parametro viola il disciplinare (dose, n. interventi, intervallo, epoca, coltura, principio attivo)
4. **Valori specifici**: es. "Dose 3.75 L/ha vs limite 3.50-4.00 L/ha", "5° intervento vs max 4 consentiti"
5. **Fonte**: nome disciplinare e anno (es. "Disciplinare Piemonte 2025")

NON LIMITARTI A DIRE "non conforme" - SPIEGA SEMPRE IL PERCHÉ con i numeri specifici!

IMPORTANTE: Se la domanda riguardava conformità/disciplinari e HAI cercato con tavily_search, includi le fonti trovate nella risposta.

Formatta la risposta in modo chiaro e professionale.`,
      );

      const answerUsageAccumulator = new UsageAccumulator();
      const answerUsageCollector = new LangChainUsageCollector(answerUsageAccumulator);
      const response = await this.model.invoke([...messages, answerPrompt], {
        callbacks: [answerUsageCollector],
      });

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(answerUsageAccumulator, {
          userId: this.userId,
          jobType: LlmJobType.JOB_VERIFICATION,
          model: this.modelName,
          metadata: { step: 'job-verification-generate-answer' },
        })
        .catch((err) => console.warn('[JOB-VERIFICATION-AGENT] Failed to log usage:', err));

      const content = response.content.toString();

      return {
        messages: [response],
        finalAnswer: content,
        reasoning: `Analisi completata per ${jobs.length} job. Fonti consultate: ${sources.length}`,
      };
    };

    // 3. Build Graph
    const workflow = new StateGraph(StateAnnotation)
      .addNode('optimize_request', optimizeRequestNode)
      .addNode('plan_tasks', planTasksNode)
      .addNode('agent', agentNode)
      .addNode('tools', toolNodeWithSources)
      .addNode('generate_answer', generateAnswerNode)
      .addEdge(START, 'optimize_request')
      .addEdge('optimize_request', 'plan_tasks')
      .addEdge('plan_tasks', 'agent');

    // 4. Define Conditional Edges
    workflow.addConditionalEdges(
      'agent',
      (state: typeof StateAnnotation.State) => {
        const lastMessage = state.messages[state.messages.length - 1] as AIMessage & {
          tool_calls?: Array<{
            name: string;
            args: Record<string, unknown>;
            id: string;
          }>;
        };

        // If requires human input for modification, interrupt
        if (state.requiresHumanInput) {
          return END;
        }

        // Force completion if we've exceeded max iterations
        if (state.iterationCount >= MAX_AGENT_ITERATIONS) {
          console.log(
            `[AGENT] Max iterations (${MAX_AGENT_ITERATIONS}) reached, forcing completion`,
          );
          return 'generate_answer';
        }

        // If the agent wants to use a tool, go to tools
        if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
          return 'tools';
        }

        // If there are more tasks, continue with agent
        if (state.currentTaskId) {
          return 'agent';
        }

        // Otherwise generate final answer
        return 'generate_answer';
      },
      {
        tools: 'tools',
        agent: 'agent',
        generate_answer: 'generate_answer',
        [END]: END,
      },
    );

    // After tools execute, return to agent for processing results
    workflow.addEdge('tools', 'agent');

    // After generating answer, end
    workflow.addEdge('generate_answer', END);

    // 5. Compile with Checkpointer
    // NOTE: Human-in-the-loop for modifications is already handled via
    // requiresHumanInput state flag and conditional edge to END
    const checkpointer = new MemorySaver();

    return workflow.compile({
      checkpointer,
    });
  }
}

/**
 * Default recursion limit for the graph execution.
 * Increase if needed for complex workflows with multiple tool calls.
 */
export const DEFAULT_RECURSION_LIMIT = 50;
