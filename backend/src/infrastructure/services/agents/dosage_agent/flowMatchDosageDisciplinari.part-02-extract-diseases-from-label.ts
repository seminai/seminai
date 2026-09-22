import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { createChatModel } from '../../llm-model-factory';
import { PromptTemplate } from '@langchain/core/prompts';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { LlmJobType } from '@prisma/client';
import { DoseSearchContext, normalizeSearchToken, usageLogger } from './flowMatchDosageDisciplinari.part-01-usage-logger';

export function extractDiseasesFromLabel(product: unknown): string[] {
  const label = (product as { label?: unknown }).label;
  if (!label || typeof label !== 'object') return [];
  const dosageDetails = (label as { dosaggi_dettagliati?: unknown[] }).dosaggi_dettagliati;
  if (!Array.isArray(dosageDetails)) return [];
  const diseases = dosageDetails
    .map((detail) => (detail as { malattia?: string }).malattia)
    .filter(
      (disease): disease is string => typeof disease === 'string' && disease.trim().length > 0,
    )
    .map((disease) => disease.trim());
  return [...new Set(diseases)];
}

export function buildEnrichedQueryContext(context: DoseSearchContext): string {
  const parts: string[] = [];
  if (context.diseases.length > 0) {
    parts.push(`Diseases: ${context.diseases.join(', ')}`);
  }
  if (context.priorityTargets && context.priorityTargets.length > 0) {
    parts.push(`Priority targets: ${context.priorityTargets.join(', ')}`);
  }
  if (context.agronomicNotes) {
    parts.push(`Agronomic notes: ${context.agronomicNotes}`);
  }
  return parts.join('. ');
}

export function recordMatchesDisease(
  record: Record<string, string>,
  diseases: ReadonlyArray<string>,
): boolean {
  if (diseases.length === 0) return false;
  const diseaseTokens = diseases
    .map((disease) => normalizeSearchToken(disease))
    .filter((disease): disease is string => Boolean(disease));
  if (diseaseTokens.length === 0) return false;
  const diseaseValues = Object.entries(record)
    .filter(([key, value]) => {
      if (!value) return false;
      return /(AVVERS|MALAT|PATO|TARGET|ORGANISMO|PARASS)/i.test(key);
    })
    .map(([, value]) => normalizeSearchToken(value))
    .filter((value): value is string => Boolean(value));
  if (diseaseValues.length === 0) return false;
  return diseaseTokens.some((token) => diseaseValues.some((value) => value.includes(token)));
}

export function prioritizeRecordsByDisease(
  records: ReadonlyArray<Record<string, string>>,
  diseases: ReadonlyArray<string>,
): ReadonlyArray<Record<string, string>> {
  if (records.length === 0 || diseases.length === 0) return records;
  const diseaseMatched = records.filter((record) => recordMatchesDisease(record, diseases));
  if (diseaseMatched.length === 0) return records;
  return diseaseMatched;
}

export function isDisciplinareEnabled(record: Record<string, string>): boolean {
  const value =
    record.SA_DISCIPLINARE ??
    record.sa_disciplinare ??
    record.SA_disciplinare ??
    record.sa_disciplinare ??
    '';
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'si';
}

export const RegionMatchSchema = z.object({
  isMatch: z.boolean().describe("Se l'indirizzo appartiene alla regione del disciplinare"),
  confidence: z.number().min(0).max(100).describe('Livello di confidenza del match (0-100)'),
  reason: z
    .string()
    .describe("Breve spiegazione del perché l'indirizzo appartiene o non appartiene alla regione"),
});

export type RegionMatchResult = z.infer<typeof RegionMatchSchema>;

export const regionMatchParser = StructuredOutputParser.fromZodSchema(RegionMatchSchema);

export async function llmMatchAddressToRegion(
  address: string,
  disciplinareRegion: string,
): Promise<RegionMatchResult> {
  const { model: llm } = createChatModel({
    modelName: 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 300,
  });

  const prompt = PromptTemplate.fromTemplate(`
Sei un esperto geografico italiano. Devi determinare se un indirizzo italiano appartiene a una specifica regione italiana.

INDIRIZZO: {address}

REGIONE DEL DISCIPLINARE: {region}

REGOLE PER IL MATCHING:
1. Confronta l'indirizzo con la regione indicata
2. Considera che le regioni italiane possono essere scritte in modi diversi:
   - "Emilia-Romagna" = "Emilia Romagna"
   - "Trentino-Alto Adige" = "Trentino Alto Adige"
   - "Friuli-Venezia Giulia" = "Friuli Venezia Giulia"
   - "Valle d'Aosta" = "Valle dAosta" = "Val dAosta"
3. Se l'indirizzo contiene il nome della regione (o una sua variante) → isMatch = true
4. Se l'indirizzo contiene una città/provincia che appartiene alla regione → isMatch = true
5. Se non c'è relazione → isMatch = false

CONFIDENZA:
- 90-100: Match diretto (nome regione esplicito nell'indirizzo)
- 70-89: Match per città/provincia nota appartenente alla regione
- 50-69: Match probabile ma incerto
- <50: Nessun match chiaro

{format_instructions}

Rispondi SOLO con il JSON richiesto, senza testo aggiuntivo.
`);

  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const chain = prompt.pipe(llm).pipe(regionMatchParser);

  try {
    const result = await chain.invoke(
      {
        address,
        region: disciplinareRegion,
        format_instructions: regionMatchParser.getFormatInstructions(),
      },
      { callbacks: [usageCollector] },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.DOSAGE,
        model: 'gpt-4o-mini',
        metadata: {
          step: 'disciplinari-address-region-match',
          address,
          region: disciplinareRegion,
        },
      })
      .catch((err) => console.warn('[DISCIPLINARI-LLM] Failed to log usage:', err));

    return result;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI-LLM] Errore nel matching LLM per indirizzo "${address}" e regione "${disciplinareRegion}":`,
      error instanceof Error ? error.message : String(error),
    );
    return {
      isMatch: false,
      confidence: 0,
      reason: `Errore nel matching LLM: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
