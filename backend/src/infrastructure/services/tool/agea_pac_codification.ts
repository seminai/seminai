/**
 * AGEA PAC Codification Tool
 *
 * Interprets AGEA PAC codes (Codici PAC AGEA) used in Italian agricultural documentation.
 * PAC codes follow the format: GGG-SSS-VVV-UUU-DDD where:
 * - GGG = Gruppo (Group) - e.g., 870 = Seminativi, 780 = Uso Non Agricolo
 * - SSS = Specie (Species) - e.g., 011 = Orzo, 003 = Colza
 * - VVV = Variante (Variant)
 * - UUU = Uso (Use)
 * - DDD = Dettaglio (Detail)
 *
 * Loads crop mappings from AGEA dataset CSV file instead of hardcoded values.
 */

import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';
import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { createChatModel } from '../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for PAC code breakdown
 */
const PacCodeBreakdownSchema = z.object({
  full: z.string().describe('Full PAC code (e.g., "870-011-000-000-000")'),
  gruppo: z.string().describe('Group code (first 3 digits)'),
  gruppoDesc: z.string().describe('Group description in Italian (e.g., "Seminativi")'),
  specie: z.string().describe('Species code (digits 4-6)'),
  specieDesc: z.string().describe('Species description in Italian (e.g., "Orzo")'),
  variante: z.string().describe('Variant code (digits 7-9)'),
  uso: z.string().describe('Use code (digits 10-12)'),
  dettaglio: z.string().describe('Detail code (digits 13-15)'),
});

/**
 * Schema for the LLM response
 */
const AgeaPacCropResultSchema = z.object({
  species: z.string().describe('Scientific name of the crop (e.g., "Hordeum vulgare" for barley)'),
  cropType: z
    .string()
    .describe('Common name of the crop in Italian (e.g., "Orzo", "Mais", "Soia")'),
  code: z
    .string()
    .nullable()
    .describe('Standardized code following pattern GENUS_SPE (e.g., "HORDE_VUL")'),
  variety: z.string().nullable().describe('Variety name if specified in the variant code'),
  pacCode: PacCodeBreakdownSchema,
  isAgricultural: z
    .boolean()
    .describe('True if this is an agricultural use, false for non-agricultural uses like TARE'),
});

export type AgeaPacCropResult = z.infer<typeof AgeaPacCropResultSchema>;

/**
 * Schema for batch processing
 */
const BatchAgeaPacResultSchema = z.object({
  results: z.array(AgeaPacCropResultSchema),
});

/**
 * AGEA Crop Entry loaded from CSV
 */
interface AgeaCropEntry {
  occupationCode: string;
  destinationCode: string;
  useCode: string;
  qualityCode: string;
  varietyName: string;
  varietyCode: string;
  occupationDescription: string;
  destinationDescription: string;
  useDescription: string;
  qualityDescription: string;
}

/**
 * AGEA Codification Service - Singleton that loads and caches AGEA data from CSV
 */
class AgeaCodificationService {
  private static instance: AgeaCodificationService;
  private cropsByOccupationCode: Map<string, AgeaCropEntry[]> = new Map();
  private occupationDescriptions: Map<string, string> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): AgeaCodificationService {
    if (!AgeaCodificationService.instance) {
      AgeaCodificationService.instance = new AgeaCodificationService();
    }
    return AgeaCodificationService.instance;
  }

  /**
   * Initialize the service by loading data from CSV
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const csvPath = path.join(
      process.cwd(),
      'dataset/agea/matrix_18.07.2025_v1_catalogo_agea_varieta_codifica_2015-2020.csv',
    );

    try {
      if (!fs.existsSync(csvPath)) {
        console.warn(`[AGEA] CSV file not found at ${csvPath}, using fallback mappings`);
        this.loadFallbackMappings();
        this.initialized = true;
        return;
      }

      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.split('\n');

      // Skip header line
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (semicolon-separated)
        const parts = line.split(';');
        if (parts.length < 15) continue;

        const entry: AgeaCropEntry = {
          occupationCode: parts[0]?.trim() || '',
          destinationCode: parts[1]?.trim() || '',
          useCode: parts[2]?.trim() || '',
          qualityCode: parts[3]?.trim() || '',
          varietyName: parts[4]?.trim() || '',
          varietyCode: parts[5]?.trim() || '',
          occupationDescription: parts[10]?.trim() || '',
          destinationDescription: parts[11]?.trim() || '',
          useDescription: parts[12]?.trim() || '',
          qualityDescription: parts[13]?.trim() || '',
        };

        if (entry.occupationCode) {
          // Store unique occupation code -> description mapping
          if (!this.occupationDescriptions.has(entry.occupationCode)) {
            this.occupationDescriptions.set(entry.occupationCode, entry.occupationDescription);
          }

          // Store all entries by occupation code
          if (!this.cropsByOccupationCode.has(entry.occupationCode)) {
            this.cropsByOccupationCode.set(entry.occupationCode, []);
          }
          this.cropsByOccupationCode.get(entry.occupationCode)!.push(entry);
        }
      }

      console.log(
        `[AGEA] Loaded ${this.occupationDescriptions.size} unique occupation codes from CSV`,
      );
      this.initialized = true;
    } catch (error) {
      console.error('[AGEA] Error loading CSV file:', error);
      this.loadFallbackMappings();
      this.initialized = true;
    }
  }

  /**
   * Load fallback mappings if CSV is not available
   */
  private loadFallbackMappings(): void {
    // Fallback occupation descriptions from CSV data
    const fallbackMappings: Record<string, string> = {
      '1': 'GRANTURCO (MAIS)',
      '2': 'GRANO (FRUMENTO) DURO',
      '4': 'SOIA',
      '9': 'FARRO',
      '16': 'LENTICCHIE',
      '19': 'RISONE',
      '20': 'PISELLO',
      '24': 'BIETOLA',
      '25': 'TABACCO',
      '27': 'CAROTA',
      '28': 'CAVOLO',
      '29': 'CICERCHIA',
      '32': 'ERBA MAZZOLINA',
      '44': 'MELO',
      '45': 'SPELTA',
      '46': 'LOIETTO LOGLIO',
      '47': 'LOIETTO LOGLIO PERENNE/LOIETTO INGLESE',
      '51': 'LUPOLINA',
      '56': 'CANAPA',
      '60': 'CEDRO',
      '76': 'LUPPOLO',
      '79': 'VECCE',
      '83': 'TOPINAMBUR',
      '89': 'PATATA AMERICANA (BATATA)',
      '113': 'AGLIO',
      '117': 'BROCCOLETTO DI RAPA',
      '118': 'CAVOLFIORE',
      '121': 'FAGIOLINO',
      '122': 'FAGIOLO',
      '127': 'LATTUGA LATTUGHINO',
      '129': 'MELANZANA',
      '130': 'MELONE',
      '134': 'POMODORO',
      '135': 'PORRO',
      '145': 'SEDANO',
      '162': 'INDIVIA O SCAROLA',
      '176': 'SORBO',
      '177': 'GELSO',
      '178': 'ACERO',
      '179': 'ONTANO',
      '181': 'CARPINO',
      '183': 'OLMO',
      '189': 'PERO',
      '194': 'TIGLIO',
      '195': 'ABETE',
      '199': 'CIPRESSO',
      '201': 'ARANCIO',
      '202': 'MANDARINO',
      '203': 'MANDARANCIO (CLEMENTINO)',
      '204': 'LIMONE',
      '205': 'POMPELMO',
      '207': 'SATSUMA',
      '240': 'BARBABIETOLA - RAPA ROSSA/BIETOLA DA COSTA',
      '265': 'FAGIOLO DI SPAGNA',
      '289': 'ANICE COMUNE',
      '298': 'BETULLA',
      '303': 'FAGGIO',
      '304': 'BIANCOSPINO',
      '305': 'BIRICOCCOLO SUSINCOCCO',
      '315': 'SAMBUCO',
      '317': 'GINEPRO',
      '357': 'ERBA MEDICA',
      '359': 'FESTUCA',
      '361': 'FESTUCA',
      '362': 'FESTUCA',
      '369': 'LOIETTO',
      '375': 'POA',
      '379': 'TRIFOGLIO',
      '381': 'TRIFOGLIO',
      '383': 'TRIFOGLIO',
      '384': 'TRIFOGLIO',
      '385': 'TRIFOGLIO',
      '388': 'TRIFOGLIO',
      '389': 'VECCIA SATIVA',
      '390': 'VECCIA VILLOSA',
      '407': "FICODINDIA O FICO D'INDIA",
      '408': 'MELOGRANO',
      '410': 'VITE',
      '412': 'ROVEJA PISELLO SELVATICO',
      '420': 'OLIVO',
      '430': 'AGRUMI',
      '435': 'LIMETTE',
      '453': "FAGIOLO DALL'OCCHIO",
      '468': 'CILIEGIO ACIDO',
      '471': 'LOTO (KAKI)',
      '472': 'FICO',
      '475': 'MIRTILLI',
      '476': 'NESPOLO',
      '491': 'CARRUBO',
      '492': 'CASTAGNO',
      '493': 'MANDORLO',
      '494': 'NOCCIOLO',
      '495': 'NOCE',
      '533': 'AVENA',
      '539': 'CARTAMO',
      '544': 'CECE',
      '562': 'ERBA MEDICA',
      '575': 'FAVE, FAVINO E FAVETTE',
      '587': 'GRANO (FRUMENTO) TENERO',
      '597': 'GRANO SARACENO',
      '607': 'LEGUMINOSE DA GRANELLA',
      '612': 'LUPINELLA',
      '615': 'LUPINO',
      '656': 'POMODORINO',
      '661': 'COTOGNO',
      '667': 'SALICE',
      '671': 'ALBICOCCO',
      '672': 'CILIEGIO',
      '673': 'SUSINO',
      '680': 'SCALOGNO',
      '684': 'SEGALA',
      '693': 'SORGO',
      '710': 'PATATA',
      '715': 'ZUCCA LAGENARIA',
      '801': 'PESCO',
      '804': 'PESCO NETTARINA',
      '831': 'ACTINIDIA (KIWI)',
      '840': 'SULLA',
      '870': 'ORZO',
      '902': 'ASPARAGO',
      '903': 'BASILICO',
      '909': 'CARCIOFO',
      '910': 'CARDI',
      '917': 'CETRIOLO',
      '919': 'CICORIA',
      '921': 'CIPOLLA',
      '924': 'COCOMERO',
      '926': 'FINOCCHIO',
      '927': 'FRAGOLA',
      '932': 'PEPERONE',
      '935': 'RADICCHIO',
      '936': 'RAVANELLO',
      '940': 'ZUCCA',
      '941': 'ZUCCHINO',
      '954': 'CAVOLO RAPA',
      '967': 'FRASSINO',
      '968': 'CAPPERO',
      '969': 'AZZERUOLO',
      '970': 'CAVOLO BROCCOLO',
      A02: 'ARANCIO AMARO o MELANGOLO',
      A10: 'AGLIONE',
      A15: 'FAVINO',
      A16: 'FAVA (FAVA GROSSA)',
      A17: 'FAVA (FAVETTA)',
    };

    for (const [code, desc] of Object.entries(fallbackMappings)) {
      this.occupationDescriptions.set(code, desc);
    }

    console.log(`[AGEA] Loaded ${this.occupationDescriptions.size} fallback occupation codes`);
  }

  /**
   * Get crop description by AGEA occupation code
   */
  getOccupationDescription(code: string): string | null {
    if (!this.initialized) {
      // Sync initialize for fallback
      this.loadFallbackMappings();
      this.initialized = true;
    }
    return this.occupationDescriptions.get(code) || null;
  }

  /**
   * Get all entries for an occupation code
   */
  getCropEntries(code: string): AgeaCropEntry[] {
    return this.cropsByOccupationCode.get(code) || [];
  }

  /**
   * Search for crops by name (partial match)
   */
  searchByName(query: string): Array<{ code: string; description: string }> {
    const results: Array<{ code: string; description: string }> = [];
    const upperQuery = query.toUpperCase();

    for (const [code, desc] of this.occupationDescriptions) {
      if (desc.toUpperCase().includes(upperQuery)) {
        results.push({ code, description: desc });
      }
    }

    return results;
  }

  /**
   * Get all occupation codes and descriptions
   */
  getAllOccupationCodes(): Map<string, string> {
    return this.occupationDescriptions;
  }
}

// Export singleton instance
export const ageaCodificationService = AgeaCodificationService.getInstance();

/**
 * Known PAC group codes for non-agricultural uses
 * These are kept hardcoded as they represent administrative categories, not crops
 */
const NON_AGRICULTURAL_GROUPS: Set<string> = new Set([
  '660', // Manufatti - Fabbricati e costruzioni
  '780', // Uso Non Agricolo
  '781', // Tare e Incolti
  '782', // Fabbricati
  '783', // Strade e Piazzali
  '784', // Acque
  '785', // Boschi
]);

/**
 * Known PAC group codes for agricultural uses
 */
const AGRICULTURAL_GROUPS: Map<string, string> = new Map([
  // Standard AGEA groups
  ['870', 'Seminativi'],
  ['871', 'Cereali'],
  ['872', 'Oleaginose'],
  ['873', 'Proteaginose'],
  ['880', 'Orticole'],
  ['890', 'Fruttiferi'],
  ['891', 'Agrumi'],
  ['892', 'Vite'],
  ['893', 'Olivo'],
  ['900', 'Foraggere'],
  // AVEPA Veneto "Piano Utilizzo" groups (different numbering from standard AGEA)
  ['001', 'Seminativi'],
  ['710', 'Orticole'],
  ['899', 'Foraggere'],
]);

/**
 * Parse a PAC code string into its components
 * Accepts formats: "870-011-000-000-000", "(870-011-000-000-000)", "870011000000000"
 */
export function parsePacCodeString(pacCode: string): {
  full: string;
  gruppo: string;
  specie: string;
  variante: string;
  uso: string;
  dettaglio: string;
} | null {
  if (!pacCode) return null;

  // Remove parentheses and spaces
  const cleaned = pacCode.replace(/[()[\]\s]/g, '').trim();

  // Try format with dashes: 870-011-000-000-000
  const dashMatch = cleaned.match(/^(\d{3})-(\d{3})-(\d{3})-(\d{3})-(\d{3})$/);
  if (dashMatch) {
    return {
      full: `${dashMatch[1]}-${dashMatch[2]}-${dashMatch[3]}-${dashMatch[4]}-${dashMatch[5]}`,
      gruppo: dashMatch[1],
      specie: dashMatch[2],
      variante: dashMatch[3],
      uso: dashMatch[4],
      dettaglio: dashMatch[5],
    };
  }

  // Try format without dashes: 870011000000000 (15 digits)
  const noDashMatch = cleaned.match(/^(\d{15})$/);
  if (noDashMatch) {
    const code = noDashMatch[1];
    return {
      full: `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6, 9)}-${code.slice(9, 12)}-${code.slice(12, 15)}`,
      gruppo: code.slice(0, 3),
      specie: code.slice(3, 6),
      variante: code.slice(6, 9),
      uso: code.slice(9, 12),
      dettaglio: code.slice(12, 15),
    };
  }

  return null;
}

/**
 * Try to resolve PAC code using AGEA codification service
 */
async function tryResolveFromAgeaCodification(
  parsed: {
    full: string;
    gruppo: string;
    specie: string;
    variante: string;
    uso: string;
    dettaglio: string;
  },
  colturaDescription?: string,
): Promise<AgeaPacCropResult | null> {
  // Initialize service if needed
  await ageaCodificationService.initialize();

  // Check if it's a known non-agricultural group
  if (NON_AGRICULTURAL_GROUPS.has(parsed.gruppo)) {
    return {
      species: 'Non agricolo',
      cropType: getGroupDescription(parsed.gruppo) || 'Uso Non Agricolo',
      code: null,
      variety: null,
      pacCode: {
        full: parsed.full,
        gruppo: parsed.gruppo,
        gruppoDesc: getGroupDescription(parsed.gruppo) || 'Uso Non Agricolo',
        specie: parsed.specie,
        specieDesc: 'Non applicabile',
        variante: parsed.variante,
        uso: parsed.uso,
        dettaglio: parsed.dettaglio,
      },
      isAgricultural: false,
    };
  }

  // Try to find crop by species code in AGEA database
  // The AGEA occupation code might match the PAC species code or group code
  // NOTE: Do NOT normalize leading zeros (e.g., '002' → '2') because AVEPA groups use
  // different species numbering than standard AGEA (e.g., AVEPA 001-002 = GRANTURCO, AGEA 2 = GRANO DURO)
  const speciesDesc = ageaCodificationService.getOccupationDescription(parsed.specie);
  const gruppoDesc = AGRICULTURAL_GROUPS.get(parsed.gruppo) || null;

  if (gruppoDesc && speciesDesc) {
    return {
      species: speciesDesc, // Using description as species name
      cropType: speciesDesc,
      code: `AGEA_${parsed.specie}`,
      variety: parsed.variante !== '000' ? `Variante ${parsed.variante}` : null,
      pacCode: {
        full: parsed.full,
        gruppo: parsed.gruppo,
        gruppoDesc,
        specie: parsed.specie,
        specieDesc: speciesDesc,
        variante: parsed.variante,
        uso: parsed.uso,
        dettaglio: parsed.dettaglio,
      },
      isAgricultural: true,
    };
  }

  // Try looking up by group code as occupation code
  const groupAsOccupation = ageaCodificationService.getOccupationDescription(parsed.gruppo);
  if (groupAsOccupation) {
    return {
      species: groupAsOccupation,
      cropType: groupAsOccupation,
      code: `AGEA_${parsed.gruppo}`,
      variety: parsed.variante !== '000' ? `Variante ${parsed.variante}` : null,
      pacCode: {
        full: parsed.full,
        gruppo: parsed.gruppo,
        gruppoDesc: gruppoDesc || groupAsOccupation,
        specie: parsed.specie,
        specieDesc: groupAsOccupation,
        variante: parsed.variante,
        uso: parsed.uso,
        dettaglio: parsed.dettaglio,
      },
      isAgricultural: true,
    };
  }

  // Fallback: if group is recognized as agricultural and we have a crop description from the file,
  // use it directly instead of falling back to LLM (avoids hallucinated crop names)
  if (gruppoDesc && colturaDescription) {
    return {
      species: colturaDescription,
      cropType: colturaDescription,
      code: `AGEA_${parsed.gruppo}_${parsed.specie}`,
      variety: parsed.variante !== '000' ? `Variante ${parsed.variante}` : null,
      pacCode: {
        full: parsed.full,
        gruppo: parsed.gruppo,
        gruppoDesc,
        specie: parsed.specie,
        specieDesc: colturaDescription,
        variante: parsed.variante,
        uso: parsed.uso,
        dettaglio: parsed.dettaglio,
      },
      isAgricultural: true,
    };
  }

  return null;
}

/**
 * Get group description
 */
function getGroupDescription(gruppo: string): string | null {
  if (NON_AGRICULTURAL_GROUPS.has(gruppo)) {
    const descriptions: Record<string, string> = {
      '660': 'Manufatti',
      '780': 'Uso Non Agricolo',
      '781': 'Tare e Incolti',
      '782': 'Fabbricati',
      '783': 'Strade e Piazzali',
      '784': 'Acque',
      '785': 'Boschi',
    };
    return descriptions[gruppo] || 'Uso Non Agricolo';
  }
  return AGRICULTURAL_GROUPS.get(gruppo) || null;
}

/**
 * Interpret a single PAC code using LLM
 */
export async function interpretPacCodeWithLLM(
  pacCode: string,
  colturaDescription?: string,
  context?: { userId?: string; companyId?: string; jobId?: string },
): Promise<AgeaPacCropResult | null> {
  const parsed = parsePacCodeString(pacCode);
  if (!parsed) {
    console.warn(`[AGEA-PAC] Invalid PAC code format: ${pacCode}`);
    return null;
  }

  // Try to resolve from AGEA codification first
  const ageaResult = await tryResolveFromAgeaCodification(parsed, colturaDescription);
  if (ageaResult) {
    console.log(`[AGEA-PAC] Resolved ${pacCode} from AGEA codification: ${ageaResult.cropType}`);
    return ageaResult;
  }

  // Use LLM for unknown codes
  const tracker = usageLogger.createTracker();
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
    maxTokens: 500,
  });
  const parser = StructuredOutputParser.fromZodSchema(AgeaPacCropResultSchema);

  const prompt = `Sei un esperto di codici PAC AGEA italiani. Interpreta il seguente codice e fornisci informazioni sulla coltura.

CODICE PAC: ${parsed.full}
- Gruppo: ${parsed.gruppo}
- Specie: ${parsed.specie}
- Variante: ${parsed.variante}
- Uso: ${parsed.uso}
- Dettaglio: ${parsed.dettaglio}
${colturaDescription ? `\nDESCRIZIONE COLTURA (dal file): ${colturaDescription}` : ''}

Il codice PAC AGEA segue il formato [Gruppo]-[Specie]-[Variante]-[Uso]-[Dettaglio]:
- Gruppo 870 = Seminativi
- Gruppo 780 = Uso Non Agricolo (TARE, fabbricati, etc.)
- Specie indica la coltura specifica (es. 011=Orzo, 014=Mais, 020=Soia)

Rispondi con il nome scientifico della coltura, il nome comune italiano, e il codice nel formato GENUS_SPE.
Se è un uso non agricolo (gruppo 780 o simili), imposta isAgricultural=false.

${parser.getFormatInstructions()}`;

  try {
    const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
    const content = typeof response.content === 'string' ? response.content : '';
    const result = await parser.parse(content);

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobType: LlmJobType.CSV_IMPORT,
      model: resolvedModelName,
      metadata: { step: 'agea-pac-interpretation', pacCode: parsed.full },
    });

    console.log(`[AGEA-PAC] LLM resolved ${pacCode}: ${result.cropType} (${result.species})`);
    return result;
  } catch (error) {
    console.error(`[AGEA-PAC] Error interpreting PAC code ${pacCode}:`, error);
    return null;
  }
}

/**
 * Batch interpret multiple PAC codes efficiently
 */
export async function batchInterpretPacCodes(
  pacCodes: Array<{ pacCode: string; colturaDescription?: string }>,
  context?: { userId?: string; companyId?: string; jobId?: string },
): Promise<Map<string, AgeaPacCropResult>> {
  const results = new Map<string, AgeaPacCropResult>();

  // Initialize AGEA service
  await ageaCodificationService.initialize();

  // First pass: resolve from AGEA codification
  const needsLlm: Array<{
    pacCode: string;
    parsed: NonNullable<ReturnType<typeof parsePacCodeString>>;
    colturaDescription?: string;
  }> = [];

  for (const { pacCode, colturaDescription } of pacCodes) {
    const parsed = parsePacCodeString(pacCode);
    if (!parsed) continue;

    const ageaResult = await tryResolveFromAgeaCodification(parsed, colturaDescription);
    if (ageaResult) {
      results.set(parsed.full, ageaResult);
    } else {
      needsLlm.push({ pacCode, parsed, colturaDescription });
    }
  }

  console.log(
    `[AGEA-PAC] Batch: ${results.size} resolved from AGEA codification, ${needsLlm.length} need LLM`,
  );

  // Second pass: batch LLM call for unknown codes
  if (needsLlm.length > 0) {
    const tracker = usageLogger.createTracker();
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const { model: llm, modelName: resolvedModelName } = createChatModel({
      modelName,
      temperature: 0,
      maxTokens: 2000,
    });
    const parser = StructuredOutputParser.fromZodSchema(BatchAgeaPacResultSchema);

    const codesList = needsLlm
      .map((item, i) => {
        const desc = item.colturaDescription ? ` (${item.colturaDescription})` : '';
        return `${i + 1}. ${item.parsed.full}${desc}`;
      })
      .join('\n');

    const prompt = `Sei un esperto di codici PAC AGEA italiani. Interpreta i seguenti codici PAC e fornisci informazioni sulle colture.

CODICI PAC DA INTERPRETARE:
${codesList}

Il codice PAC AGEA segue il formato [Gruppo]-[Specie]-[Variante]-[Uso]-[Dettaglio]:
- Gruppo 870 = Seminativi, 880 = Orticole, 890 = Fruttiferi, 892 = Vite, 893 = Olivo
- Gruppo 780-785 = Uso Non Agricolo (TARE, fabbricati, boschi, etc.)
- Specie indica la coltura specifica

Per ogni codice, fornisci:
- species: nome scientifico
- cropType: nome comune italiano
- code: codice nel formato GENUS_SPE
- variety: varieta se specificata
- pacCode: breakdown del codice
- isAgricultural: true se agricolo, false per TARE/fabbricati/etc.

${parser.getFormatInstructions()}`;

    try {
      const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
      const content = typeof response.content === 'string' ? response.content : '';
      const batchResult = await parser.parse(content);

      for (let i = 0; i < batchResult.results.length && i < needsLlm.length; i++) {
        const result = batchResult.results[i];
        const original = needsLlm[i];
        results.set(original.parsed.full, result);
      }

      await usageLogger.logFromAccumulator(tracker.accumulator, {
        userId: context?.userId,
        companyId: context?.companyId,
        jobId: context?.jobId,
        jobType: LlmJobType.CSV_IMPORT,
        model: resolvedModelName,
        metadata: { step: 'agea-pac-batch-interpretation', count: needsLlm.length },
      });

      console.log(`[AGEA-PAC] LLM batch resolved ${batchResult.results.length} codes`);
    } catch (error) {
      console.error('[AGEA-PAC] Error in batch interpretation:', error);
      // Fallback: try individual interpretation
      for (const item of needsLlm) {
        const result = await interpretPacCodeWithLLM(
          item.pacCode,
          item.colturaDescription,
          context,
        );
        if (result) {
          results.set(item.parsed.full, result);
        }
      }
    }
  }

  return results;
}

/**
 * Get crop identification from PAC code (compatible with ProductionCycleRaw)
 */
export async function getCropFromPacCode(
  pacCode: string,
  colturaDescription?: string,
  context?: { userId?: string; companyId?: string; jobId?: string },
): Promise<{
  cropName: string | null;
  cropType: string | null;
  cropCode: string | null;
  variety: string | null;
  isAgricultural: boolean;
}> {
  const result = await interpretPacCodeWithLLM(pacCode, colturaDescription, context);

  if (!result) {
    return {
      cropName: null,
      cropType: colturaDescription || 'Sconosciuto',
      cropCode: null,
      variety: null,
      isAgricultural: true,
    };
  }

  return {
    cropName: result.species,
    cropType: result.cropType,
    cropCode: result.code,
    variety: result.variety,
    isAgricultural: result.isAgricultural,
  };
}

/**
 * Check if a PAC code represents non-agricultural use
 */
export function isNonAgriculturalPacCode(pacCode: string): boolean {
  // Special case: Overlapping (OVL-OVL-OVL-OVL-OVL)
  if (pacCode && pacCode.toUpperCase().includes('OVL')) {
    return true;
  }

  const parsed = parsePacCodeString(pacCode);
  if (!parsed) return false;

  return NON_AGRICULTURAL_GROUPS.has(parsed.gruppo);
}

/**
 * Get crop description by AGEA occupation code (direct lookup)
 */
export async function getCropByOccupationCode(code: string): Promise<string | null> {
  await ageaCodificationService.initialize();
  return ageaCodificationService.getOccupationDescription(code);
}

/**
 * Search crops by name in AGEA database
 */
export async function searchCropsByName(
  query: string,
): Promise<Array<{ code: string; description: string }>> {
  await ageaCodificationService.initialize();
  return ageaCodificationService.searchByName(query);
}
