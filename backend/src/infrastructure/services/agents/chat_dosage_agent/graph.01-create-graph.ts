import type { AgentState } from './types';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { DESTRUCTIVE_TOOLS } from './graph.support';
import type { AgentGraphFactoryContext } from './graph.context';
import { buildChatDosageGraphTools } from './graph-tool-setup';
import { compileChatDosageWorkflow } from './graph-workflow';
import { logChatDosageUsage } from './graph-usage';

export function agentGraphFactoryCreateGraph(this: AgentGraphFactoryContext) {
    const toolSetup = buildChatDosageGraphTools.call(this);
    const { tools, canModifyJobs, hasRulesContext, modelWithTools } = toolSetup;

    // 2. Define Nodes

    /**
     * Agent reasoning node.
     * Processes user messages and decides whether to use tools or respond directly.
     */
    const agentNode = async (state: AgentState): Promise<Partial<AgentState>> => {
      const { messages } = state;

      const hasJobOperationsSearch =
        this.jobOperationsVectorStore && this.jobOperationsVectorStore.hasDocuments();
      const hasDisciplinariPdf = !!this.disciplinariPdfVectorStore;
      const hasModificationTools = !!canModifyJobs;

      const jobOpsInstructions = hasJobOperationsSearch
        ? `
JOB OPERATIONS SEARCH (PREFERRED):
- When the user asks about current job operations (treatments, products used, dates, etc.), ALWAYS use search_job_operations.
- This tool uses semantic search to find relevant operations without loading all data.
- Example queries: "trattamenti con rame", "operazioni di gennaio", "quale prodotto contro ticchiolatura"
- Do NOT use get_job_details to search specific operations — use search_job_operations instead.
- get_job_details is useful only for general job info, NOT for searching operations.
`
        : '';

      const disciplinariPdfInstructions = hasDisciplinariPdf
        ? `
DISCIPLINARI BDF PDF SEARCH (HIGH PRIORITY FOR COMPLIANCE):
- Use search_disciplinari_bdf_pdf when you need exact rules from official regional disciplinari (lotta integrata 2024–2025).
- Prefer this tool over tavily_scientific_search for dose limits, max interventions, phenological windows.
- Always specify the "region" and "year" parameters when known.
- PDFs are downloaded on first use (~15–30s). Subsequent queries are instant.
- Example: search_disciplinari_bdf_pdf(query="dose captano melo", region="Emilia-Romagna", year=2025)
`
        : '';

      const modificationInstructions = hasModificationTools
        ? `
JOB MODIFICATION TOOLS:
- Use update_job to modify an existing job based on the user's explicit request.
- Use create_job to add a new agricultural operation.
- Use optimize_selected_jobs ONLY on explicit optimization requests (e.g. "ottimizza", "distribuisci su più giorni", "spalma trattamenti").

MANDATORY WORKFLOW before any modification:
1. FIND: Use search_job_operations or get_job_details to identify the exact job ID(s) to modify.
2. VALIDATE: Check compliance with search_rules, search_disciplinari_database, or search_disciplinari_bdf_pdf.
3. PROPOSE: Call update_job or create_job with a clear "reason" that includes the compliance source.
4. INFORM: Always tell the user what you are about to change and why, BEFORE calling the tool.

WORKFLOW FOR optimize_selected_jobs:
1. Collect one or more target job IDs from user context.
2. Use optimize_selected_jobs only if the user explicitly asks optimization/splitting over multiple days.
3. Keep label/BDF constraints as hard limits (dose max, max interventions, minimum interval).
4. Explain what was created (new jobs IDs, dates, source constraints) after the tool result.

WORKFLOW FOR merge_treatment_dates:
- Use merge_treatment_dates when the user asks to combine, merge, or move multiple treatments to the same date.
- Trigger phrases: "unisci", "accorpa", "sposta alla stessa data", "metti tutti il", "stessa data", "unifica le date", "raggruppali".
- Steps:
  1. FIND: Use search_job_operations to identify the specific job IDs the user refers to.
  2. CONFIRM DATE: If the user specifies a date, use it. If not, ask the user which date to use.
  3. EXPLAIN: Before calling the tool, clearly list which jobs will be moved and to which date.
  4. CALL: Use merge_treatment_dates with the job IDs, target date, and a descriptive reason.
  5. REPORT: After execution, summarize the changes made.
- This tool only changes dates — it does NOT merge stocks, quantities, or other fields.
- Each job retains its own products, quantities, and other attributes; only dateOfOpeation changes.

NEVER modify a job without first confirming the target job ID and the compliance basis.
The "reason" field is mandatory and must reference the source (e.g. "Disciplinare Emilia-Romagna 2025: dose max 2.5 kg/ha").

Modification response format:
- Summarize what will change: field, old value → new value
- State the compliance basis (which disciplinare, rule, or source)
- After execution, confirm the change with the updated values
`
        : '';

      const hasDosagePipeline = !!this.threadId;
      const dosagePipelineInstructions = hasDosagePipeline
        ? `
PIPELINE CALCOLO DOSAGGI:
Quando l'utente chiede di calcolare, pianificare dosaggi o trattamenti fitosanitari:
1. Usa search_products con la lista prodotti, coltura e unità produttive per abbinare prodotti e estrarre etichette.
2. Usa calculate_dosage per calcolare date, dosi e intervalli di trattamento.
3. Usa validate_compliance per verificare la conformità con i disciplinari regionali.
4. (Opzionale) Se l'utente chiede di ottimizzare o ci sono problemi di stock, usa optimize_dosage.
5. Presenta i risultati in formato tabellare MARKDOWN chiaro:
   | Prodotto | Coltura | Dose (kg/ha) | Data | Intervallo (gg) | Conformità |
   |----------|---------|-------------|------|-----------------|------------|
6. Chiedi all'utente se vuole modificare qualcosa prima di confermare.
7. Solo dopo approvazione esplicita dell'utente, usa create_treatment_jobs per salvare i job nel database.

IMPORTANTE: create_treatment_jobs è un'operazione distruttiva che richiede approvazione. NON procedere al salvataggio senza conferma esplicita.
I tool search_products, calculate_dosage, validate_compliance e optimize_dosage sono read-only e si eseguono automaticamente.
`
        : '';

      const hasStockTools = !!this.userId;
      const stockProductionInstructions = hasStockTools
        ? `
STOCK E UNITÀ PRODUTTIVE:
- Usa search_company_stock_products per cercare i prodotti in magazzino dell'utente.
- Usa list_production_units per mostrare campi e unità produttive disponibili.
- Usa check_product_crop_authorizations per verificare su quali colture i prodotti sono autorizzati (etichetta).

FLUSSO VERIFICA PRODOTTI PER COLTURA:
1. Se l'utente chiede quali prodotti a magazzino sono per una specifica coltura (es. "quali prodotti sono per il melo?"):
   a. Se hai già la lista dei prodotti dalla conversazione precedente → usa check_product_crop_authorizations con quei prodotti e la coltura target.
   b. Se NON hai ancora la lista → chiama prima search_company_stock_products, poi check_product_crop_authorizations con i risultati.
2. Passa sempre nome prodotto E numero di registrazione (se disponibile) a check_product_crop_authorizations per una ricerca più precisa.
3. Lo strumento consulta prima le etichette nel database, poi la Banca Dati Fitofarmaci (BDF) come fallback.

FLUSSO CARICAMENTO PRODOTTI:
1. Se l'utente chiede i prodotti in magazzino → usa search_company_stock_products
2. Se l'utente vuole caricare prodotti ma NON ha specificato l'unità produttiva/campo → chiedi e mostra con list_production_units
3. Se l'utente NON ha specificato la superficie trattata → chiedi "Quale è la superficie trattata (in ettari)?"
4. Se tutte le info sono già presenti → procedi direttamente con create_job
5. NON chiedere info già fornite nel messaggio corrente o precedente.
`
        : '';

      const rulesSearchInstructions = hasRulesContext
        ? `
WORKSPACE RULES SEARCH:
- Use search_rules to retrieve vectorized rules from the workspace.
- When a job is selected, company-assigned rules are included with priority.
- Includes ALL categories: DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM.
- Prefer [COMPANY_ASSIGNED] rules when they conflict with [WORKSPACE] rules.
`
        : '';

      // Build search priority list dynamically based on available tools
      let priorityNum = 1;
      const searchPriorityLines: string[] = [];
      if (hasRulesContext) {
        searchPriorityLines.push(
          `${priorityNum++}. **FIRST**: When asked about compliance, product conformity, doses, standards, methodologies, or best practices, use search_rules FIRST. This searches all vectorized workspace rules (disciplinari, standards, best practices, methodologies, custom).`,
        );
      }
      searchPriorityLines.push(
        `${priorityNum++}. Use search_disciplinari_bdf_pdf (when available) for official PDF content from regional disciplinari 2024–2025.`,
        `${priorityNum++}. If PDF search not available or incomplete, use search_disciplinari_database for structured extracted data.`,
        `${priorityNum++}. Use bdf_search_product_doses or bdf_search_products_by_adversity for official dose/product data from the national BDF API.`,
        `${priorityNum++}. If all local sources are insufficient, use tavily_scientific_search to find official sources online.`,
        `${priorityNum++}. Do NOT rely on general web sources, blogs, forums, or non-official content.`,
        `${priorityNum}. Be precise and evidence-based in all responses.`,
      );

      // Build compliance workflow dynamically
      let complianceStepNum = 1;
      const complianceSteps: string[] = [];
      if (hasRulesContext) {
        complianceSteps.push(
          `${complianceStepNum++}. FIRST: search_rules(query="<question with product and region>")`,
        );
      }
      complianceSteps.push(
        `${complianceStepNum++}. search_disciplinari_bdf_pdf(query="<product> <crop> <region>", region="<region>", year=<year>)`,
        `${complianceStepNum++}. search_disciplinari_database(region="<region>", productName="<product>")`,
        `${complianceStepNum}. FALLBACK: tavily_scientific_search`,
      );

      const todayIso = new Date().toISOString().slice(0, 10);
      const systemPrompt = new SystemMessage(
        `DATA CORRENTE: ${todayIso}. Usa questa data come riferimento per qualsiasi espressione temporale relativa ("oggi", "domani", "tra X giorni", "prossimi N mesi", "questa stagione"). NON usare la tua data di training.

You are an expert agricultural assistant specialized in crop treatments, dosages, and phytosanitary products for the Italian market.
${jobOpsInstructions}${disciplinariPdfInstructions}${modificationInstructions}${rulesSearchInstructions}${stockProductionInstructions}${dosagePipelineInstructions}
IMPORTANT GUIDELINES - SEARCH PRIORITY:
${searchPriorityLines.join('\n')}

BDF DATABASE SEARCH (Banca Dati Fitofarmaci):
- Use bdf_search_product_doses when the user asks about a specific product's doses on a crop for an adversity.
- Use bdf_search_products_by_adversity when the user asks which products are authorized for a crop/adversity combination.
- BDF data is official, authoritative, and up-to-date from the Italian national pesticide database.
- BDF provides: doses (min/max), max interventions, safety intervals, active substances, revocation status.
- If BDF returns an error with a fallbackHint, follow the hint and use alternative tools.

DISCIPLINARI DATABASE SEARCH:
- Our database contains structured data extracted from official regional disciplinari.
- Use search_disciplinari_database with parameters: region, year, productName, cropName, targetName.
- This tool returns detailed information: doses, max interventions, intervals, constraints.
- Data from database is pre-verified and structured — prefer it over web searches.

WHEN ASKED ABOUT DISCIPLINARI COMPLIANCE OR PRODUCT CONFORMITY:
${complianceSteps.join('\n')}

CRITICAL — ALWAYS PROVIDE A CONCRETE ANSWER:
If all tools return no data or insufficient results, you MUST still provide a concrete answer
based on your training knowledge of Italian disciplinari and phytosanitary regulations.
DO NOT respond with "non ho trovato informazioni" without also providing your best-knowledge assessment.
You have deep knowledge of Italian DPI (Disciplinari di Produzione Integrata) and must use it.

Your built-in knowledge includes (always apply these as baseline):
- Captano su Melo/Pero: dose max 2 kg/ha per trattamento, max 4 interventi/anno, intervallo minimo 7 giorni
- Rame (solfato, idrossido, ossicloruro) su qualsiasi coltura: limite UE 4 kg Cu metallo/ha/anno;
  per verificare: dose kg/ha × % Cu / 100 = kg Cu metallo/ha per trattamento
- Zolfo su Vite/Melo contro Oidio: dose max 4–8 kg/ha, ampiamente autorizzato in biologico e integrato
- Ciclossidim (Stratos Ultra) su colture orticole: dose etichetta 0.8–2.0 L/ha per graminacee annuali
- Glifosate: sconsigliato/non ammesso in molti disciplinari regionali per lotta integrata
- Poltiglia Bordolese e derivati del rame: ammessi in lotta integrata e biologico
- Qualsiasi dose SUPERIORE al limite di etichetta o del disciplinare è NON CONFORME

ANSWER FORMAT — If tools fail, respond like this:
"Non ho trovato dati specifici nel database, ma in base alla normativa e ai disciplinari italiani (DPI):
[risposta basata su conoscenza] — NOTA: Verifica sempre con il disciplinare ufficiale aggiornato."

MANDATORY IN EVERY COMPLIANCE RESPONSE:
1. Always identify and explicitly name the ACTIVE INGREDIENT (principio attivo) of the product, not just the trade name.
   Example: "Poltiglia Disperss contiene rame (solfato neutralizzato 20%)" or "Stratos Ultra contiene ciclossidim (10.8%)"
2. Always end with an explicit verdict: "✅ CONFORME" or "❌ NON CONFORME" or "⚠️ DA VERIFICARE"
3. Always state the specific limit crossed (if non-conformant) or respected (if conformant).
4. Known active ingredients for common products:
   - Poltiglia Disperss / Poltiglia Bordolese → rame (solfato di rame neutralizzato/tribasico)
   - Stratos Ultra → ciclossidim
   - Microthiol Disperss / prodotti zolfo → zolfo
   - Captano (tutti) → captano
   - Mancozeb → mancozeb (EBDC)
   - Glifosate → glifosate

STRUCTURED RESPONSE FORMAT:
When providing information about a product, include:
- Product/active ingredient name
- Maximum number of interventions per year/cycle
- Minimum and maximum doses with units
- Minimum interval between treatments (days)
- Phenological window (when applicable)
- Compliance status: CONFORME / NON CONFORME / DA VERIFICARE
- Source (Database disciplinare, PDF BDF, web citation, or "conoscenza agronomica di base")

EXAMPLE STRUCTURED RESPONSE:
**Prodotto: Captano** (Disciplinare Emilia-Romagna 2025)
- **Bersaglio**: Ticchiolatura
- **Dose**: 1.5–2.0 kg/ha | Dose richiesta: 1.5 kg/ha ✓
- **N. max interventi**: 4 per anno
- **Intervallo minimo**: 7 giorni
- **Finestra fenologica**: BBCH 10 – BBCH 75
- **Conformità**: ✅ CONFORME al disciplinare di produzione integrata
- **Fonte**: Disciplinare Emilia-Romagna 2025 (PDF ufficiale BDF)

CITATION REQUIREMENTS:
- For workspace/company rules: include rule name and source type (COMPANY_ASSIGNED/WORKSPACE)
- For PDF disciplinari: cite "Disciplinare <Regione> <Anno>" as source
- For database results: cite "Disciplinare <Regione> <Anno>" as source
- For web results: include URL and brief fragment explaining the source
- For knowledge-based answers: explicitly state "basato su conoscenza DPI italiani"
- Always indicate if data comes from workspace/company rules, PDF, database, web, or knowledge`,
      );

      const hasSystemMessage = messages.some((msg) => msg instanceof SystemMessage);
      const messagesWithSystem = hasSystemMessage ? messages : [systemPrompt, ...messages];

      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const response = await modelWithTools.invoke(messagesWithSystem, {
        callbacks: [usageCollector],
      });

      logChatDosageUsage(usageAccumulator, this);

      const aiMessage = response as AIMessage & {
        tool_calls?: Array<{
          name: string;
          args: Record<string, unknown>;
          id: string;
        }>;
      };

      if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
        const toolCall = aiMessage.tool_calls[0];
        return {
          messages: [response],
          pendingAction: {
            tool: toolCall.name,
            args: toolCall.args,
            description: `Execute ${toolCall.name} with arguments: ${JSON.stringify(toolCall.args)}`,
            requiresApproval: DESTRUCTIVE_TOOLS.has(toolCall.name),
          },
        };
      }

      return { messages: [response] };
    };

    return compileChatDosageWorkflow.call(this, { tools, agentNode });
  }
