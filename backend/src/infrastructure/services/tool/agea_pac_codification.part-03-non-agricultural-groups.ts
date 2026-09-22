import { createChatModel } from '../llm-model-factory';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { LlmJobType } from '@prisma/client';
import { AgeaPacCropResult, AgeaPacCropResultSchema, usageLogger } from './agea_pac_codification.part-01-usage-logger';
import { ageaCodificationService } from './agea_pac_codification.part-02-agea-codification-service';

/**
 * Known PAC group codes for non-agricultural uses
 * These are kept hardcoded as they represent administrative categories, not crops
 */
export const NON_AGRICULTURAL_GROUPS: Set<string> = new Set([
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
export const AGRICULTURAL_GROUPS: Map<string, string> = new Map([
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
export async function tryResolveFromAgeaCodification(
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
export function getGroupDescription(gruppo: string): string | null {
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
