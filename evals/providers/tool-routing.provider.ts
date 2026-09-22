/**
 * Custom promptfoo provider for testing tool selection via OpenAI function calling.
 * Sends the system prompt + tools definitions and evaluates which tool the model selects.
 * Returns the tool name as output for assertion matching.
 *
 * Run `npx tsx llm-test/scripts/generate-prompt.ts` before using.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  ApiProvider,
  ProviderOptions,
  ProviderResponse,
  CallApiContextParams,
} from 'promptfoo';
import { fetchChatCompletion } from '../../backend/src/infrastructure/services/llm-chat-completion-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GeneratedPrompts {
  readonly allFeatures: string;
  readonly minimalFeatures: string;
  readonly generatedAt: string;
}

function loadGeneratedPrompt(): GeneratedPrompts {
  const filePath = path.resolve(__dirname, '..', '.generated', 'system-prompt.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `System prompt not found at ${filePath}. Run: npx tsx llm-test/scripts/generate-prompt.ts`,
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GeneratedPrompts;
}

/**
 * Simplified tool definitions for the dosage agent.
 * Each tool has name, description, and minimal parameter schema.
 */
const AGENT_TOOLS = [
  { name: 'search_products', description: 'Cerca prodotti fitosanitari per coltura e avversità' },
  { name: 'calculate_dosage', description: 'Calcola dosaggi per i prodotti trovati' },
  { name: 'validate_compliance', description: 'Valida conformità ai disciplinari regionali' },
  { name: 'validate_sa_group_limits', description: 'Valida limiti gruppi sostanze attive' },
  { name: 'check_compatibility', description: 'Verifica compatibilità chimica tra prodotti' },
  { name: 'plan_strategy', description: 'Costruisce strategia di trattamento cross-prodotto' },
  { name: 'optimize_dosage', description: 'Ottimizza dosi rispettando disponibilità stock' },
  { name: 'calculate_stock', description: 'Calcola bilancio scorte magazzino' },
  { name: 'check_revoked', description: 'Verifica prodotti revocati' },
  { name: 'expand_cycles', description: 'Espande unità produttive con cicli colturali' },
  { name: 'extract_buffer_zones', description: 'Estrae fasce di rispetto dei campi' },
  { name: 'enrich_bdf', description: 'Arricchisce dati con BDF (Banca Dati Fitofarmaci)' },
  { name: 'generate_treatment_plan', description: 'Genera piano di trattamento strutturato' },
  { name: 'modify_plan_step', description: 'Modifica un passo del piano attivo' },
  { name: 'execute_treatment_plan', description: 'Esegue il piano di trattamento approvato' },
  { name: 'create_treatment_jobs', description: 'Crea job di trattamento nel database' },
  { name: 'start_dosage_agent_job', description: 'Lancia pipeline dosaggio completa' },
  { name: 'list_existing_job_groups', description: 'Lista gruppi di job esistenti' },
  { name: 'list_user_companies', description: "Lista aziende dell'utente" },
  { name: 'list_production_units', description: 'Lista unità produttive' },
  { name: 'list_company_products', description: 'Lista prodotti azienda' },
  { name: 'list_user_fields', description: "Lista campi dell'utente" },
  { name: 'schedule_alert', description: 'Schedula alert proattivo' },
  { name: 'ask_user_questions', description: "Presenta questionario strutturato all'utente" },
  { name: 'get_working_memory_details', description: 'Recupera dettagli working memory' },
  {
    name: 'delegate_to_field_note',
    description: 'Delega a field note agent per registrare operazioni passate',
  },
  { name: 'approve_field_note', description: 'Approva proposta field note' },
  { name: 'reject_field_note', description: 'Rifiuta proposta field note' },
  { name: 'create_company', description: 'Crea nuova azienda' },
  { name: 'create_fields', description: 'Crea campi per azienda' },
  { name: 'create_production_units', description: 'Crea unità produttive su campi' },
  { name: 'update_production_units', description: 'Aggiorna unità produttive esistenti' },
  { name: 'extract_from_file', description: 'Estrae dati da file CSV/Excel/PDF/Shapefile' },
  {
    name: 'normalize_extraction',
    description:
      'Normalizza in modo deterministico i dati di wm.extractedFileData (dedup campi catastrale, status new/existing/occupied, raggruppamento UP). Chiamare PRIMA di present_extraction_review per Piano Colturale.',
  },
  {
    name: 'present_extraction_review',
    description: 'Mostra il form di revisione dei dati estratti',
  },
  { name: 'import_from_file', description: 'Importa dati estratti nel database' },
  { name: 'import_stock_from_file', description: 'Importa dati stock/magazzino da file' },
  { name: 'check_extraction_status', description: 'Controlla stato estrazione file asincrona' },
  { name: 'run_conformity_check', description: 'Esegue controllo conformità su job group' },
  { name: 'confirm_conformity_check', description: 'Applica correzioni conformità' },
  { name: 'update_job', description: 'Aggiorna job esistente (date, dosi, prodotti)' },
  { name: 'add_job', description: 'Aggiunge job a gruppo esistente' },
  { name: 'merge_treatment_dates', description: 'Unisce job su stessa data' },
  { name: 'optimize_selected_jobs', description: 'Ottimizza distribuzione trattamenti nel tempo' },
  { name: 'search_company_stock', description: 'Cerca scorte nel magazzino aziendale' },
  {
    name: 'check_product_crop_authorizations',
    description: 'Verifica autorizzazione prodotto per coltura',
  },
  { name: 'search_rules', description: 'Cerca regole workspace (disciplinari, standard)' },
  { name: 'search_product_label_database', description: 'Cerca etichette ministeriali prodotti' },
  {
    name: 'search_disciplinari_database',
    description: 'Cerca disciplinari strutturati per regione/coltura',
  },
  {
    name: 'search_disciplinari_bdf_pdf',
    description: 'Cerca PDF disciplinari regionali 2024-2025',
  },
  {
    name: 'bdf_search_product_doses',
    description: 'Cerca dosi ufficiali BDF per prodotto su coltura',
  },
  {
    name: 'bdf_search_products_by_adversity',
    description: 'Cerca prodotti BDF per avversità su coltura',
  },
  {
    name: 'recommend_best_products',
    description:
      "Raccomanda i MIGLIORI prodotti e principi attivi per curare un'avversità su una coltura (ranking per efficacia, rotazione FRAC, bio/carenza, disponibilità a magazzino)",
  },
  {
    name: 'diagnose_from_photo',
    description:
      "Identifica malattie/insetti di una pianta a partire da una FOTO allegata dall'utente",
  },
  {
    name: 'tavily_scientific_search',
    description: 'Ricerca online fonti scientifiche (solo come fallback)',
  },
  { name: 'create_workspace_rule', description: 'Crea regola workspace' },
  { name: 'update_workspace_rule', description: 'Aggiorna regola workspace' },
  { name: 'archive_workspace_rule', description: 'Archivia regola workspace' },
  { name: 'list_user_workspaces', description: 'Lista workspace utente' },
  { name: 'list_workspace_rules', description: 'Lista regole workspace' },
  { name: 'plan_task', description: 'Pianifica task persistenti (TodoWrite equivalente)' },
  {
    name: 'get_weather_forecast',
    description:
      'Recupera previsioni meteo orarie da Open-Meteo per coordinate generiche (latitudine/longitudine).',
  },
  {
    name: 'evaluate_treatment_window',
    description:
      'Valuta finestra di applicazione e rischi meteo (vento/pioggia/gelate) per un trattamento programmato su un Job o Field, in una data pianificata.',
  },
].map((t) => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: { type: 'object', properties: {}, required: [] },
  },
}));

export default class ToolRoutingProvider implements ApiProvider {
  private readonly providerId: string;
  private readonly model: string;
  private readonly temperature: number;

  constructor(options: ProviderOptions) {
    this.providerId = options.id || 'dosage-tool-routing';
    this.model = (options.config?.model as string) ?? 'gpt-4o';
    this.temperature = (options.config?.temperature as number) ?? 0;
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    const generated = loadGeneratedPrompt();
    const systemPromptText = generated.allFeatures;

    try {
      const response = await fetchChatCompletion({
        model: this.model,
        messages: [
          { role: 'system', content: systemPromptText },
          { role: 'user', content: prompt },
        ],
        tools: AGENT_TOOLS,
        toolChoice: 'auto',
        temperature: this.temperature,
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `LLM API error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{ function: { name: string; arguments: string } }>;
          };
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const message = data.choices[0].message;
      const toolCalls = message.tool_calls;

      // Return the tool name as output for assertion matching
      // If no tool was called, return the text response
      const output = toolCalls?.length
        ? `TOOL_SELECTED: ${toolCalls[0].function.name}`
        : `NO_TOOL: ${message.content ?? ''}`;

      return {
        output,
        tokenUsage: {
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
          total: data.usage.total_tokens,
        },
      };
    } catch (err) {
      return { error: `Provider error: ${(err as Error).message}` };
    }
  }
}
