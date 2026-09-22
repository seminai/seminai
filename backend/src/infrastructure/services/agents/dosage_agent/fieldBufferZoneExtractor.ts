import { z } from 'zod';
import { DosageAgentContext } from './context';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import type { RawUnitOfProduction } from './types';
import { callWithFallback, extractResponseText } from './llmProvider';
import { mapWithLimit } from './parallelLimiter';

/**
 * Enum dei tipi di fascia di rispetto
 */
export const BufferZoneTypeEnum = z.enum([
  'corpo_idrico',
  'centro_abitato',
  'parco',
  'colture_adiacenti',
  'strade',
  'altro',
]);

export type BufferZoneType = z.infer<typeof BufferZoneTypeEnum>;

/**
 * Schema per il risultato dell'estrazione fasce di rispetto dal campo
 */
export const FieldBufferZoneSchema = z.object({
  buffer_zones: z.array(
    z.object({
      tipo: BufferZoneTypeEnum,
      area_mq: z.number().nullable(),
      area_ha: z.number().nullable(),
      distanza_m: z.number().nullable(),
      descrizione_originale: z.string(),
    }),
  ),
  area_totale_non_trattabile_ha: z.number(),
});

export type FieldBufferZoneResult = z.infer<typeof FieldBufferZoneSchema>;

const EMPTY_RESULT: FieldBufferZoneResult = {
  buffer_zones: [],
  area_totale_non_trattabile_ha: 0,
};

/**
 * Calculates the adjusted treatable area after buffer zone reduction.
 * Shared utility used by both dosage_agent and conformity_checker_agent.
 *
 * Logic:
 * 1. If sauHa is available → maxTreatable = sauHa - bufferAreaHa
 *    - If currentAreaHa <= maxTreatable: no reduction needed
 *    - Else: use maxTreatable
 * 2. If sauHa not available → reduce directly: currentAreaHa - bufferAreaHa
 * 3. If the residual area is zero/negative, return 0 to mark the unit as not treatable
 */
export function calculateAdjustedTreatableArea(params: {
  currentAreaHa: number;
  sauHa?: number | null;
  bufferAreaHa: number;
  minTreatable?: number;
}): { adjustedAreaHa: number; wasReduced: boolean } {
  const { currentAreaHa, sauHa, bufferAreaHa, minTreatable = 0 } = params;

  if (sauHa != null && Number.isFinite(sauHa) && sauHa > 0) {
    const maxTreatable = sauHa - bufferAreaHa;
    if (currentAreaHa <= maxTreatable) {
      return { adjustedAreaHa: currentAreaHa, wasReduced: false };
    }
    const adjusted = maxTreatable <= 0 ? minTreatable : maxTreatable;
    return { adjustedAreaHa: adjusted, wasReduced: true };
  }

  // sauHa not available: best effort reduction
  const adjusted = currentAreaHa - bufferAreaHa;
  if (adjusted <= 0) {
    return { adjustedAreaHa: minTreatable, wasReduced: true };
  }
  return { adjustedAreaHa: adjusted, wasReduced: currentAreaHa !== adjusted };
}
const MAX_BUFFER_ZONE_TEXT_LENGTH = 2000;

/**
 * Sanitizza testo utente prima dell'interpolazione nel prompt LLM.
 * Tronca, rimuove code fences e marcatori di ruolo che potrebbero confondere il modello.
 */
function sanitizeForPrompt(text: string): string {
  return text
    .slice(0, MAX_BUFFER_ZONE_TEXT_LENGTH)
    .replace(/```/g, '')
    .replace(/\b(system|assistant|user)\s*:/gi, '')
    .trim();
}

/**
 * Cache per evitare chiamate LLM ridondanti sullo stesso testo bufferZoneNotes.
 * Bounded: TTL 30 minuti, max 200 entries.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_SIZE = 200;
const BUFFER_ZONE_PRELOAD_CONCURRENCY = 5;
const fieldBufferZoneCache = new Map<string, { data: FieldBufferZoneResult; expiresAt: number }>();

function cacheGet(key: string): FieldBufferZoneResult | undefined {
  const entry = fieldBufferZoneCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    fieldBufferZoneCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function cacheSet(key: string, data: FieldBufferZoneResult): void {
  if (fieldBufferZoneCache.size >= CACHE_MAX_SIZE) {
    const firstKey = fieldBufferZoneCache.keys().next().value;
    if (firstKey !== undefined) fieldBufferZoneCache.delete(firstKey);
  }
  fieldBufferZoneCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Estrae dati strutturati sulle fasce di rispetto dal campo bufferZoneNotes.
 * Usa LLM per parsare il testo libero in dati strutturati.
 *
 * @param bufferZoneNotes - Testo libero dal campo Field.bufferZoneNotes
 * @param context - Contesto dosage agent per logging/tracking
 * @returns Dati strutturati sulle fasce di rispetto con area totale non trattabile
 */
export async function extractFieldBufferZones(
  bufferZoneNotes: string | null | undefined,
  context?: DosageAgentContext,
): Promise<FieldBufferZoneResult> {
  const trimmed = bufferZoneNotes?.trim();
  if (!trimmed) {
    return EMPTY_RESULT;
  }

  // Check cache (with TTL)
  const cached = cacheGet(trimmed);
  if (cached) {
    console.log(`[FIELD-BUFFER-ZONE] Cache hit for bufferZoneNotes`);
    return cached;
  }

  // LLM extraction
  const result = await extractFieldBufferZonesWithLLM(trimmed, context);
  cacheSet(trimmed, result);
  return result;
}

/**
 * LLM-based extraction for field buffer zone notes
 */
async function extractFieldBufferZonesWithLLM(
  bufferZoneNotes: string,
  context?: DosageAgentContext,
): Promise<FieldBufferZoneResult> {
  const tracker = usageLogger.createTracker();

  const prompt = `Analizza il seguente testo che descrive le fasce di rispetto di un campo agricolo.
Estrai TUTTE le fasce di rispetto menzionate.

TESTO:
${sanitizeForPrompt(bufferZoneNotes)}

Per ogni fascia di rispetto, identifica:
1. tipo: corpo_idrico | centro_abitato | parco | colture_adiacenti | strade | altro
   - corpo_idrico: fiumi, canali, fossi, laghi, torrenti, acque superficiali, corsi d'acqua
   - centro_abitato: zone abitate, centri urbani, abitazioni
   - parco: parchi naturali, aree protette, riserve
   - colture_adiacenti: colture vicine, campi adiacenti
   - strade: strade, vie di comunicazione
   - altro: qualsiasi altra fascia di rispetto
2. area_mq: area in metri quadrati (null se non specificata)
3. area_ha: area in ettari (null se non specificata). Se hai solo m², converti: 1 ha = 10000 m²
4. distanza_m: distanza in metri (null se non specificata)
5. descrizione_originale: testo originale che descrive questa fascia

Calcola area_totale_non_trattabile_ha = somma di tutti gli area_ha delle fasce trovate.
Se nessuna fascia ha un'area specificata, area_totale_non_trattabile_ha = 0.

IMPORTANTE:
- Se viene specificata solo l'area in m², calcola anche area_ha (dividi per 10000)
- Se viene specificata solo l'area in ha, calcola anche area_mq (moltiplica per 10000)
- Se viene specificata solo la distanza ma non l'area, metti area_mq e area_ha a null
- Riporta il testo originale, non parafrasare

Rispondi SOLO in JSON con questo formato:
{"buffer_zones": [{"tipo": "...", "area_mq": ..., "area_ha": ..., "distanza_m": ..., "descrizione_originale": "..."}], "area_totale_non_trattabile_ha": ...}`;

  try {
    const { result: parsed, usedModel } = await callWithFallback<FieldBufferZoneResult>({
      operation: 'buffer-zone',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);
        const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const json = JSON.parse(cleanedContent);
        return FieldBufferZoneSchema.parse(json);
      },
    });

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: { step: 'field-buffer-zone-extraction' },
    });

    console.log(
      `[FIELD-BUFFER-ZONE] Extracted ${parsed.buffer_zones.length} buffer zones, total non-treatable: ${parsed.area_totale_non_trattabile_ha} ha`,
    );
    return parsed;
  } catch (err) {
    console.error('[FIELD-BUFFER-ZONE] LLM extraction failed:', err);
    return EMPTY_RESULT;
  }
}

/**
 * Applica la riduzione area basata sulle fasce di rispetto del campo.
 * Per ogni unità con bufferZoneNotes:
 * - Estrae area non trattabile con LLM
 * - Confronta con sauHa (area totale campo) e areaHa (area unità produttiva)
 * - Riduce areaHa se l'utente non ha già compensato sufficientemente
 *
 * @param units - Unità di produzione normalizzate
 * @param context - Contesto dosage agent
 * @returns Unità con areaHa eventualmente ridotta
 */
export async function applyFieldBufferZoneReduction(
  units: RawUnitOfProduction[],
  context?: DosageAgentContext,
): Promise<RawUnitOfProduction[]> {
  // Deduplica bufferZoneNotes per evitare chiamate LLM multiple per lo stesso testo
  const uniqueNotes = new Set<string>();
  for (const unit of units) {
    const notes = (unit as { bufferZoneNotes?: string | null }).bufferZoneNotes?.trim();
    if (notes) {
      uniqueNotes.add(notes);
    }
  }

  if (uniqueNotes.size === 0) {
    console.log('[FIELD-BUFFER-ZONE] No units with bufferZoneNotes, skipping reduction');
    return units;
  }

  console.log(
    `[FIELD-BUFFER-ZONE] Processing ${uniqueNotes.size} unique bufferZoneNotes across ${units.length} units`,
  );

  // Pre-extract all unique buffer zone notes (populates cache) with limited concurrency.
  await mapWithLimit(
    [...uniqueNotes],
    async (notes) => extractFieldBufferZones(notes, context),
    BUFFER_ZONE_PRELOAD_CONCURRENCY,
  );

  // Apply reduction to each unit
  const result: RawUnitOfProduction[] = [];
  for (const unit of units) {
    const notes = (unit as { bufferZoneNotes?: string | null }).bufferZoneNotes?.trim();
    if (!notes) {
      result.push(unit);
      continue;
    }

    const bufferZoneResult = await extractFieldBufferZones(notes, context); // served from cache
    if (bufferZoneResult.area_totale_non_trattabile_ha <= 0) {
      result.push(unit);
      continue;
    }

    const unitAreaHa = unit.areaHa;
    const sauHa = (unit as { sauHa?: number }).sauHa;
    const bufferAreaHa = bufferZoneResult.area_totale_non_trattabile_ha;

    if (typeof unitAreaHa !== 'number' || !Number.isFinite(unitAreaHa) || unitAreaHa <= 0) {
      result.push(unit);
      continue;
    }

    const { adjustedAreaHa, wasReduced } = calculateAdjustedTreatableArea({
      currentAreaHa: unitAreaHa,
      sauHa,
      bufferAreaHa,
    });
    if (!wasReduced) {
      console.log(
        `[FIELD-BUFFER-ZONE] Unit ${unit.id || 'unknown'}: areaHa ${unitAreaHa} already compatible with buffer zones`,
      );
      result.push(unit);
      continue;
    }

    if (adjustedAreaHa <= 0) {
      console.warn(
        `[FIELD-BUFFER-ZONE] Unit ${unit.id || 'unknown'}: buffer zone area (${bufferAreaHa}) leaves no treatable surface. Marking areaHa as 0.`,
      );
    } else if (typeof sauHa === 'number' && Number.isFinite(sauHa) && sauHa > 0) {
      console.log(
        `[FIELD-BUFFER-ZONE] Unit ${unit.id || 'unknown'}: reducing areaHa from ${unitAreaHa} to ${adjustedAreaHa.toFixed(4)} (sauHa=${sauHa}, buffer=${bufferAreaHa})`,
      );
    } else {
      console.warn(
        `[FIELD-BUFFER-ZONE] Unit ${unit.id || 'unknown'}: sauHa not available, best effort reduction from ${unitAreaHa} to ${adjustedAreaHa.toFixed(4)} (buffer=${bufferAreaHa})`,
      );
    }

    result.push({
      ...unit,
      areaHa: adjustedAreaHa,
    });
  }

  return result;
}

/**
 * Svuota la cache delle fasce di rispetto (utile per testing)
 */
export function clearFieldBufferZoneCache(): void {
  fieldBufferZoneCache.clear();
}
