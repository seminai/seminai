import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import crypto from 'crypto';
import {
  createScrapeGraphClient,
  DisciplinariExtractionCategory,
} from '../integrations/scrapegraph';
import {
  DisciplinariMetadataSchema,
  DisciplinariRulesSchema,
  DefenseTargetSchema,
  ScopeEntitySchema,
} from '../integrations/scrapegraph/schemas';
import type {
  DisciplinariExtractedData,
  DisciplinariMetadata,
  DisciplinariRules,
  DefenseTarget,
  ScopeEntity,
  AllowedIntervention,
  ApplicationLimits,
} from '../../../domain/dtos/disciplinari.dto';
import {
  PrismaDisciplinariExtractionRepository,
  DisciplinariExtractionInput,
} from '../../repositories/PrismaDisciplinariExtractionRepository';
import { prisma } from '../../repositories/Prisma';

// ============================================================
// Types and Interfaces
// ============================================================

export interface ScrapeGraphExtractionParams {
  readonly url: string;
  readonly region?: string;
  readonly year?: number;
  readonly category?: DisciplinariExtractionCategory;
  readonly saveToDatabase?: boolean;
  readonly userId?: string;
}

export interface ScrapeGraphExtractionResult {
  readonly success: boolean;
  readonly category: DisciplinariExtractionCategory;
  readonly data: Partial<DisciplinariExtractedData>;
  readonly confidence: number;
  readonly sourceUrl: string;
  readonly databaseId?: string;
  readonly error?: string;
}

// ============================================================
// Prompt Templates by Category
// ============================================================

const EXTRACTION_PROMPTS: Record<DisciplinariExtractionCategory, string> = {
  metadata: `
Estrai i metadati del disciplinare di produzione integrata da questa pagina web.
Cerca le seguenti informazioni:
- Regione (es: Emilia-Romagna, Piemonte, Lombardia)
- Anno di riferimento (es: 2025, 2024)
- Versione o revisione (es: Rev. 1, Versione 2.0)
- Titolo completo del documento
- Data di inizio validità (formato: YYYY-MM-DD)
- Data di fine validità/scadenza (formato: YYYY-MM-DD)
- Se il documento è scaduto rispetto alla data odierna

Restituisci i dati in formato JSON strutturato.
`,

  rules: `
Estrai le regole generali del disciplinare di produzione integrata da questa pagina web.
Cerca le seguenti informazioni:
- Principi generali (priorità dei mezzi agronomici, IPM, etc.)
- Divieti espliciti (prodotti vietati, pratiche proibite)
- Azioni obbligatorie (monitoraggi, registrazioni, certificazioni)
- Definizioni e glossario dei termini tecnici

Restituisci i dati in formato JSON strutturato.
`,

  defense_targets: `
Estrai le informazioni sui target di difesa (avversità) dal disciplinare.
Per ogni avversità trova:
- Nome dell'avversità (parassita, malattia fungina, infestante)
- Tipo (insetto, fungo, infestante, altro)
- Misure di monitoraggio consigliate
- Misure agronomiche preventive
- Misure biologiche alternative
- Interventi chimici ammessi con:
  - Nome prodotto o principio attivo
  - Dose minima e massima con unità di misura
  - Numero massimo applicazioni e ambito (anno/ciclo)
  - Intervallo minimo tra trattamenti
  - Stadio fenologico ammesso
  - Vincoli e limitazioni

Restituisci i dati in formato JSON strutturato.
`,

  interventions: `
Estrai TUTTI gli interventi fitosanitari ammessi dal disciplinare.
Per ogni intervento trova:
- Nome commerciale o principio attivo
- Formulazione (se indicata)
- Dose minima e massima con unità (kg/ha, L/ha, g/hl, %)
- Numero massimo interventi per anno/ciclo
- Intervallo minimo giorni tra trattamenti
- Tempo di carenza (PHI) in giorni
- Finestra fenologica di applicazione
- Vincoli ambientali (fasce di rispetto, deriva)
- Note sulla gestione delle resistenze

Restituisci i dati in formato JSON strutturato.
`,

  scope_entities: `
Estrai le colture e le sezioni del disciplinare.
Per ogni voce trova:
- Nome della coltura (es: Vite, Melo, Pero, Pomodoro)
- Gruppo/famiglia (es: Fruttiferi, Orticole, Vitivinicole)
- Sezione del disciplinare (es: Difesa, Diserbo, Fertilizzazione)
- Sottosezione (es: Malattie fungine, Insetti, etc.)

Restituisci i dati in formato JSON strutturato.
`,
};

// ============================================================
// Output Schemas for ScrapeGraph
// ============================================================

function getOutputSchemaForCategory(
  category: DisciplinariExtractionCategory,
): Record<string, unknown> {
  const schemas: Record<DisciplinariExtractionCategory, Record<string, unknown>> = {
    metadata: {
      type: 'object',
      properties: {
        region: { type: 'string', description: 'Italian region name' },
        year: { type: 'integer', description: 'Reference year' },
        version: { type: 'string', description: 'Document version' },
        title: { type: 'string', description: 'Document title' },
        validFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        validUntil: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        isExpired: { type: 'boolean', description: 'Whether document is expired' },
      },
    },
    rules: {
      type: 'object',
      properties: {
        generalPrinciples: { type: 'array', items: { type: 'string' } },
        prohibitions: { type: 'array', items: { type: 'string' } },
        mandatoryActions: { type: 'array', items: { type: 'string' } },
        definitions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              term: { type: 'string' },
              definition: { type: 'string' },
            },
          },
        },
      },
    },
    defense_targets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['insetto', 'fungo', 'infestante', 'altro'] },
            },
          },
          monitoring: { type: 'array', items: { type: 'string' } },
          agronomicMeasures: { type: 'array', items: { type: 'string' } },
          biologicalMeasures: { type: 'array', items: { type: 'string' } },
          interventions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productOrActive: {
                  type: 'object',
                  properties: { name: { type: 'string' }, normalized: { type: 'string' } },
                },
                dose: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                    unit: { type: 'string' },
                  },
                },
                applications: {
                  type: 'object',
                  properties: { max: { type: 'integer' }, scope: { type: 'string' } },
                },
                phi: {
                  type: 'object',
                  properties: { preharvestIntervalDays: { type: 'integer' } },
                },
              },
            },
          },
        },
      },
    },
    interventions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productOrActive: {
            type: 'object',
            properties: { name: { type: 'string' }, normalized: { type: 'string' } },
          },
          formulation: { type: 'string' },
          dose: {
            type: 'object',
            properties: {
              min: { type: 'number' },
              max: { type: 'number' },
              unit: { type: 'string' },
              notes: { type: 'string' },
            },
          },
          applications: {
            type: 'object',
            properties: { max: { type: 'integer' }, scope: { type: 'string' } },
          },
          interval: { type: 'object', properties: { minDays: { type: 'integer' } } },
          phi: { type: 'object', properties: { preharvestIntervalDays: { type: 'integer' } } },
          phenology: {
            type: 'object',
            properties: { from: { type: 'string' }, to: { type: 'string' } },
          },
          constraints: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
      },
    },
    scope_entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          crop: {
            type: 'object',
            properties: { name: { type: 'string' }, group: { type: 'string' } },
          },
          section: { type: 'object', properties: { name: { type: 'string' } } },
          subsection: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    },
  };

  return schemas[category];
}

// ============================================================
// Category Detection
// ============================================================

function detectCategoryFromUrl(url: string): DisciplinariExtractionCategory {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('difesa') || urlLower.includes('fitosanitari')) {
    return 'defense_targets';
  }
  if (urlLower.includes('diserbo') || urlLower.includes('infestanti')) {
    return 'interventions';
  }
  if (urlLower.includes('norme') || urlLower.includes('regole') || urlLower.includes('principi')) {
    return 'rules';
  }
  if (urlLower.includes('colture') || urlLower.includes('schede')) {
    return 'scope_entities';
  }

  return 'metadata';
}

// ============================================================
// Data Mapping Functions
// ============================================================

function mapToMetadata(data: unknown): DisciplinariMetadata | null {
  try {
    const parsed = DisciplinariMetadataSchema.safeParse(data);
    if (!parsed.success) return null;

    return {
      region: parsed.data.region ?? 'Unknown',
      year: parsed.data.year ?? new Date().getFullYear(),
      version: parsed.data.version,
      title: parsed.data.title ?? 'Unknown',
      sourceUrlOrFile: null,
      validFrom: parsed.data.validFrom,
      validUntil: parsed.data.validUntil,
      isExpired: parsed.data.isExpired,
    };
  } catch {
    return null;
  }
}

function mapToRules(data: unknown): DisciplinariRules | null {
  try {
    const parsed = DisciplinariRulesSchema.safeParse(data);
    if (!parsed.success) return null;

    return {
      generalPrinciples: parsed.data.generalPrinciples,
      prohibitions: parsed.data.prohibitions,
      mandatoryActions: parsed.data.mandatoryActions,
      definitions: parsed.data.definitions,
    };
  } catch {
    return null;
  }
}

function mapToDefenseTargets(data: unknown): DefenseTarget[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const parsed = DefenseTargetSchema.safeParse(item);
      if (!parsed.success) return null;
      return parsed.data as DefenseTarget;
    })
    .filter((item): item is DefenseTarget => item !== null);
}

function mapToScopeEntities(data: unknown): ScopeEntity[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const parsed = ScopeEntitySchema.safeParse(item);
      if (!parsed.success) return null;
      return parsed.data as ScopeEntity;
    })
    .filter((item): item is ScopeEntity => item !== null);
}

function mapInterventionFromRaw(raw: unknown): AllowedIntervention {
  const item = raw as Record<string, unknown>;
  const productOrActive = item.productOrActive as Record<string, unknown> | undefined;
  const dose = item.dose as Record<string, unknown> | undefined;
  const applications = item.applications as Record<string, unknown> | undefined;
  const interval = item.interval as Record<string, unknown> | undefined;
  const phi = item.phi as Record<string, unknown> | undefined;
  const phenology = item.phenology as Record<string, unknown> | undefined;

  return {
    productOrActive: {
      name: String(productOrActive?.name ?? 'Unknown'),
      normalized: (productOrActive?.normalized as string) ?? null,
    },
    formulation: (item.formulation as string) ?? null,
    dose: {
      min: (dose?.min as number) ?? null,
      max: (dose?.max as number) ?? null,
      unit: (dose?.unit as string) ?? null,
      notes: (dose?.notes as string) ?? null,
    },
    applications: {
      min: (applications?.min as number) ?? null,
      max: (applications?.max as number) ?? null,
      scope: (applications?.scope as ApplicationLimits['scope']) ?? null,
    },
    interval: {
      minDays: (interval?.minDays as number) ?? null,
    },
    phi: phi
      ? {
          preharvestIntervalDays: (phi?.preharvestIntervalDays as number) ?? null,
        }
      : null,
    phenology: {
      from: (phenology?.from as string) ?? null,
      to: (phenology?.to as string) ?? null,
    },
    constraints: Array.isArray(item.constraints) ? (item.constraints as string[]) : [],
    environmentalConstraints: [],
    resistanceManagement: [],
    notes: (item.notes as string) ?? null,
    sourceLocator: { page: null, tableId: null, rowHint: null },
  };
}

// ============================================================
// Database Save Function
// ============================================================

async function saveToDatabase(
  url: string,
  data: Partial<DisciplinariExtractedData>,
  confidence: number,
  userId?: string,
): Promise<string | undefined> {
  try {
    const repo = new PrismaDisciplinariExtractionRepository(prisma);
    const metadata = data.documentMetadata;

    if (!metadata) {
      console.warn('[SCRAPEGRAPH] Cannot save without metadata');
      return undefined;
    }

    const fileHash = crypto.createHash('sha256').update(url).digest('hex');

    const input: DisciplinariExtractionInput = {
      fileHash,
      fileName: url.split('/').pop() ?? 'web_extraction',
      sourceUrl: url,
      region: metadata.region,
      year: metadata.year,
      version: metadata.version ?? undefined,
      title: metadata.title,
      validFrom: metadata.validFrom ? new Date(metadata.validFrom) : undefined,
      validUntil: metadata.validUntil ? new Date(metadata.validUntil) : undefined,
      isExpired: metadata.isExpired,
      rawText: '',
      extractedData: data,
      extractionConfidence: confidence,
      extractionErrors: [],
      createdById: userId,
    };

    const extraction = await repo.upsertByHash(input);

    console.log(`[SCRAPEGRAPH] Saved to database with ID: ${extraction.id}`);
    return extraction.id;
  } catch (error) {
    console.error('[SCRAPEGRAPH] Database save failed:', error);
    return undefined;
  }
}

// ============================================================
// Main Extraction Function
// ============================================================

/**
 * Extracts disciplinari data from a URL using ScrapeGraph AI
 */
export async function extractDisciplinariFromUrl(
  params: ScrapeGraphExtractionParams,
): Promise<ScrapeGraphExtractionResult> {
  const apiKey = process.env.SCRAPERGRAPH_API_KEY;

  if (!apiKey) {
    console.warn('[SCRAPEGRAPH] SCRAPERGRAPH_API_KEY not configured');
    return {
      success: false,
      category: params.category ?? 'metadata',
      data: {},
      confidence: 0,
      sourceUrl: params.url,
      error: 'SCRAPERGRAPH_API_KEY not configured',
    };
  }

  const client = createScrapeGraphClient(apiKey);
  const category = params.category ?? detectCategoryFromUrl(params.url);
  const prompt = EXTRACTION_PROMPTS[category];
  const outputSchema = getOutputSchemaForCategory(category);

  try {
    console.log(`[SCRAPEGRAPH] Extracting ${category} from: ${params.url}`);

    const response = await client.smartScrape({
      website_url: params.url,
      user_prompt: prompt,
      output_schema: outputSchema,
    });

    // ScrapeGraph API can return either:
    // 1. Direct result object (most common)
    // 2. Wrapper with { status, result, error }
    // Handle both cases
    const isWrapper =
      response &&
      typeof response === 'object' &&
      ('status' in response || 'result' in response || 'request_id' in response);

    let extractedResult: unknown;

    if (isWrapper) {
      // It's a wrapper response
      const wrapper = response as { status?: string; result?: unknown; error?: string };
      if (wrapper.status === 'failed' || (wrapper.status && !wrapper.result)) {
        return {
          success: false,
          category,
          data: {},
          confidence: 0,
          sourceUrl: params.url,
          error: wrapper.error ?? 'Extraction failed',
        };
      }
      extractedResult = wrapper.result ?? response;
    } else {
      // It's a direct result
      extractedResult = response;
    }

    console.log(
      '[SCRAPEGRAPH] Extracted result:',
      JSON.stringify(extractedResult, null, 2).substring(0, 500),
    );

    if (
      !extractedResult ||
      (typeof extractedResult === 'object' && Object.keys(extractedResult).length === 0)
    ) {
      return {
        success: false,
        category,
        data: {},
        confidence: 0,
        sourceUrl: params.url,
        error: 'No data extracted from page',
      };
    }

    // Map extracted data to DTOs based on category
    // Use mutable object and cast at the end
    let documentMetadata: DisciplinariMetadata | undefined;
    let rules: DisciplinariRules | undefined;
    let defenseTargets: DefenseTarget[] | undefined;
    let scopeEntities: ScopeEntity[] | undefined;
    let confidence = 70;

    switch (category) {
      case 'metadata': {
        const metadata = mapToMetadata(extractedResult);
        if (metadata) {
          documentMetadata = metadata;
          confidence = metadata.region !== 'Unknown' ? 85 : 60;
        }
        break;
      }

      case 'rules': {
        const rulesData = mapToRules(extractedResult);
        if (rulesData) {
          rules = rulesData;
          confidence = rulesData.generalPrinciples.length > 0 ? 80 : 60;
        }
        break;
      }

      case 'defense_targets': {
        defenseTargets = mapToDefenseTargets(extractedResult);
        confidence = defenseTargets.length > 0 ? 85 : 50;
        break;
      }

      case 'interventions': {
        const interventions = Array.isArray(extractedResult) ? extractedResult : [];
        defenseTargets = [
          {
            target: { name: 'Generale', type: 'altro' },
            monitoring: [],
            agronomicMeasures: [],
            biologicalMeasures: [],
            interventions: interventions.map(mapInterventionFromRaw),
          },
        ];
        confidence = interventions.length > 0 ? 80 : 50;
        break;
      }

      case 'scope_entities': {
        scopeEntities = mapToScopeEntities(extractedResult);
        confidence = scopeEntities.length > 0 ? 80 : 50;
        break;
      }
    }

    // Build extracted data object
    const extractedData: Partial<DisciplinariExtractedData> = {
      ...(documentMetadata && { documentMetadata }),
      ...(rules && { rules }),
      ...(defenseTargets && { defenseTargets }),
      ...(scopeEntities && { scopeEntities }),
    };

    // Save to database if requested
    let databaseId: string | undefined;
    if (params.saveToDatabase && extractedData.documentMetadata) {
      databaseId = await saveToDatabase(params.url, extractedData, confidence, params.userId);
    }

    console.log(`[SCRAPEGRAPH] Successfully extracted ${category} with confidence ${confidence}%`);

    return {
      success: true,
      category,
      data: extractedData,
      confidence,
      sourceUrl: params.url,
      databaseId,
    };
  } catch (error) {
    console.error('[SCRAPEGRAPH] Extraction failed:', error);
    return {
      success: false,
      category,
      data: {},
      confidence: 0,
      sourceUrl: params.url,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================
// LangChain Tool Wrapper
// ============================================================

/**
 * Creates a LangChain DynamicStructuredTool for disciplinari extraction
 */
export const createScrapeGraphDisciplinariTool = (apiKey?: string) => {
  const scrapeGraphApiKey = apiKey ?? process.env.SCRAPERGRAPH_API_KEY;

  if (!scrapeGraphApiKey) {
    throw new Error('SCRAPERGRAPH_API_KEY environment variable is required');
  }

  return new DynamicStructuredTool({
    name: 'extract_disciplinari_from_url',
    description: `Extracts structured data from Italian regional disciplinari (agricultural regulations) web pages using AI-powered web scraping.

Use this tool when you need to:
- Extract metadata (region, year, validity dates) from disciplinari URLs
- Get allowed treatments and interventions for specific crops
- Find rules, prohibitions, and mandatory actions
- Identify pest/disease targets and their treatments

The tool automatically categorizes the type of data based on the URL content.`,

    schema: z.object({
      url: z.string().url().describe('The URL of the disciplinari web page to extract data from'),
      region: z.string().optional().describe('Optional region hint (e.g., "Emilia-Romagna")'),
      year: z.number().optional().describe('Optional year hint (e.g., 2025)'),
      category: z
        .enum(['metadata', 'rules', 'defense_targets', 'interventions', 'scope_entities'])
        .optional()
        .describe('Optional category to focus extraction on'),
      saveToDatabase: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to save the extraction to the database'),
    }),

    func: async ({ url, region, year, category, saveToDatabase }) => {
      const result = await extractDisciplinariFromUrl({
        url,
        region,
        year,
        category: category as DisciplinariExtractionCategory | undefined,
        saveToDatabase,
      });

      if (!result.success) {
        return `Extraction failed for URL "${url}": ${result.error}`;
      }

      const summary: string[] = [
        `[${result.category.toUpperCase()}] Extraction successful (confidence: ${result.confidence}%)`,
        `Source: ${result.sourceUrl}`,
      ];

      if (result.databaseId) {
        summary.push(`Database ID: ${result.databaseId}`);
      }

      switch (result.category) {
        case 'metadata':
          if (result.data.documentMetadata) {
            const m = result.data.documentMetadata;
            summary.push(`Region: ${m.region}, Year: ${m.year}`);
            summary.push(`Title: ${m.title}`);
            if (m.validUntil) {
              summary.push(`Valid until: ${m.validUntil} (${m.isExpired ? 'EXPIRED' : 'active'})`);
            }
          }
          break;

        case 'rules':
          if (result.data.rules) {
            const r = result.data.rules;
            summary.push(`Principles: ${r.generalPrinciples.length}`);
            summary.push(`Prohibitions: ${r.prohibitions.length}`);
            summary.push(`Mandatory actions: ${r.mandatoryActions.length}`);
          }
          break;

        case 'defense_targets':
          if (result.data.defenseTargets) {
            summary.push(`Defense targets: ${result.data.defenseTargets.length}`);
            const totalInterventions = result.data.defenseTargets.reduce(
              (sum, t) => sum + t.interventions.length,
              0,
            );
            summary.push(`Total interventions: ${totalInterventions}`);
          }
          break;

        case 'scope_entities':
          if (result.data.scopeEntities) {
            summary.push(`Scope entities (crops): ${result.data.scopeEntities.length}`);
          }
          break;
      }

      return summary.join('\n');
    },
  });
};
