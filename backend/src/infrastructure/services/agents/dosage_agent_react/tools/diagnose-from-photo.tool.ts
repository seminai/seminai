import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { buildImageContentPart, fetchVisionCompletion } from '../../../llm-vision-client';
import { getAnalyticsService } from '../../../analytics/analytics-service.singleton';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import type { PhotoDiagnosis } from '../type/photo-diagnosis';
import { TOOL_TIMEOUTS, withAbortableTimeout } from './timeout-utils';

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_DIAGNOSIS_IMAGE_BYTES = 15 * 1024 * 1024;

const PLANT_PATHOLOGY_PROMPT =
  'Sei un fitopatologo e entomologo agrario esperto. Analizza la foto e rispondi solo con JSON valido. ' +
  'Non inventare: se la foto non mostra una pianta o non e chiara, usa status "not_plant" o "unclear". ' +
  'Formato richiesto: {"status":"diagnosed|unclear|not_plant","visibleSymptoms":["..."],' +
  '"possibleCauses":["..."],"severity":"low|medium|high|unknown","recommendedActions":["..."],' +
  '"followUpQuestions":["..."],"candidates":[{"avversita":"nome comune italiano",' +
  '"nomeScientifico":"nome scientifico o null","confidence":0..1,"reasoning":"sintomi osservati",' +
  '"tipo":"fungina|insetto|batterica|acaro|fisiopatia|carenza|altro"}],"cropGuess":"coltura o null",' +
  '"notes":"note brevi o null"}. Le azioni devono essere brevi, pratiche e prudenti.';

interface DiagnosisCandidate {
  readonly avversita: string;
  readonly nomeScientifico?: string | null;
  readonly confidence: number;
  readonly reasoning?: string;
  readonly tipo?: string;
}

interface ParsedDiagnosis {
  readonly status?: string;
  readonly candidates?: readonly DiagnosisCandidate[];
  readonly cropGuess?: string | null;
  readonly notes?: string | null;
  readonly visibleSymptoms?: readonly string[];
  readonly possibleCauses?: readonly string[];
  readonly severity?: string;
  readonly recommendedActions?: readonly string[];
  readonly followUpQuestions?: readonly string[];
}

interface UploadedImage {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeSeverity(value: unknown): PhotoDiagnosis['severity'] {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'unknown';
}

function normalizeStatus(
  value: unknown,
  candidates: readonly DiagnosisCandidate[],
): PhotoDiagnosis['status'] {
  if (value === 'diagnosed' || value === 'unclear' || value === 'not_plant') return value;
  return candidates.length > 0 ? 'diagnosed' : 'unclear';
}

function normalizeCandidate(value: unknown): DiagnosisCandidate | undefined {
  const record = asRecord(value);
  if (!record || typeof record.avversita !== 'string' || record.avversita.trim().length === 0) {
    return undefined;
  }
  const rawConfidence = Number(record.confidence);
  return {
    avversita: record.avversita.trim(),
    nomeScientifico: typeof record.nomeScientifico === 'string' ? record.nomeScientifico : null,
    confidence: Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0.3,
    reasoning: typeof record.reasoning === 'string' ? record.reasoning : undefined,
    tipo: typeof record.tipo === 'string' ? record.tipo : undefined,
  };
}

function normalizeCandidates(value: unknown): DiagnosisCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCandidate)
    .filter((candidate): candidate is DiagnosisCandidate => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence);
}

function parseDiagnosis(raw: string): ParsedDiagnosis | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = asRecord(JSON.parse(raw.slice(start, end + 1)));
    if (!parsed) return null;
    return {
      status: typeof parsed.status === 'string' ? parsed.status : undefined,
      candidates: normalizeCandidates(parsed.candidates),
      cropGuess: typeof parsed.cropGuess === 'string' ? parsed.cropGuess : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes : null,
      visibleSymptoms: toStringArray(parsed.visibleSymptoms),
      possibleCauses: toStringArray(parsed.possibleCauses),
      severity: typeof parsed.severity === 'string' ? parsed.severity : undefined,
      recommendedActions: toStringArray(parsed.recommendedActions),
      followUpQuestions: toStringArray(parsed.followUpQuestions),
    };
  } catch {
    return null;
  }
}

function buildFallbackDiagnosis(
  status: PhotoDiagnosis['status'],
  fileName: string | undefined,
  notes: string,
): PhotoDiagnosis {
  return {
    status,
    candidates: [],
    visibleSymptoms: [],
    possibleCauses: [],
    severity: 'unknown',
    recommendedActions: [
      'Isola la pianta dalle altre se possibile.',
      'Evita trattamenti alla cieca finche i sintomi non sono piu chiari.',
      'Rimuovi solo le parti molto compromesse e disinfetta gli attrezzi.',
    ],
    followUpQuestions: [
      'Quale coltura e varieta e?',
      'Da quanti giorni sono presenti i sintomi?',
      'Puoi inviare una foto nitida di foglia sopra/sotto e fusto?',
    ],
    cropGuess: null,
    notes,
    fileName,
  };
}

function buildDiagnosis(parsed: ParsedDiagnosis, fileName: string, model: string): PhotoDiagnosis {
  const candidates = parsed.candidates ?? [];
  const status = normalizeStatus(parsed.status, candidates);
  return {
    status,
    candidates,
    visibleSymptoms: parsed.visibleSymptoms ?? [],
    possibleCauses: parsed.possibleCauses ?? [],
    severity: normalizeSeverity(parsed.severity),
    recommendedActions: parsed.recommendedActions ?? [],
    followUpQuestions: parsed.followUpQuestions ?? [],
    cropGuess: parsed.cropGuess ?? null,
    notes: parsed.notes ?? null,
    fileName,
    model,
  };
}

function findSupportedImage(
  files: readonly UploadedImage[] | undefined,
): UploadedImage | undefined {
  return files?.find((file) => IMAGE_MIME_TYPES.has(file.mimeType.toLowerCase()));
}

function buildToolResult(diagnosis: PhotoDiagnosis): string {
  return JSON.stringify({
    ...diagnosis,
    workingMemoryKey: 'photoDiagnosis',
    message:
      "Diagnosi visiva pronta. Rispondi ora in modo breve con sintomi visibili, possibili cause, gravita, azioni consigliate e domande di follow-up se servono. Fermati: non chiamare recommend_best_products, search_products, calculate_dosage o strumenti di pianificazione a meno che l'utente lo chieda esplicitamente in un turno successivo.",
  });
}

/**
 * Creates a read-only tool that diagnoses plant disease or pest candidates from a user photo.
 */
export function createDiagnoseFromPhotoTool(
  threadId: string,
  userId?: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'diagnose_from_photo',
    description:
      "Analizza una FOTO allegata dall'utente per capire se mostra una pianta malata, sintomi visibili, " +
      'possibili cause, gravita e prime azioni pratiche. Usa questo tool per foto di piante malate. ' +
      'Dopo il tool rispondi brevemente e fermati: non proporre prodotti o piani senza richiesta esplicita.',
    schema: z.object({
      cropContext: z
        .string()
        .optional()
        .describe(
          'Coltura indicata dall\'utente, se nota (es. "Vite"), per orientare la diagnosi.',
        ),
    }),
    func: async ({ cropContext }) => {
      const wm = getWorkingMemory(threadId);
      const image = findSupportedImage(wm.uploadedFiles);
      if (!image) {
        const diagnosis = buildFallbackDiagnosis(
          'unsupported',
          wm.uploadedFileName,
          'Nessuna immagine JPEG, PNG o WebP disponibile in working memory.',
        );
        return buildToolResult(diagnosis);
      }
      if (image.buffer.length > MAX_DIAGNOSIS_IMAGE_BYTES) {
        const diagnosis = buildFallbackDiagnosis(
          'too_large',
          image.fileName,
          'Immagine troppo grande per la diagnosi rapida. Limite locale: 15 MB.',
        );
        updateWorkingMemory(threadId, { photoDiagnosis: diagnosis });
        return buildToolResult(diagnosis);
      }
      try {
        const base64 = image.buffer.toString('base64');
        const result = await withAbortableTimeout(
          (signal) =>
            fetchVisionCompletion({
              messages: [
                { role: 'system', content: PLANT_PATHOLOGY_PROMPT },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Coltura indicata: ${cropContext ?? 'non specificata'}. Analizza solo cio che e visibile nella foto.`,
                    },
                    buildImageContentPart(base64, image.mimeType.toLowerCase(), 'high'),
                  ],
                },
              ],
              responseFormat: { type: 'json_object' },
              temperature: 0.1,
              maxTokens: 900,
              signal,
            }),
          TOOL_TIMEOUTS.DIAGNOSE_PHOTO,
          'diagnose_from_photo',
        );
        const parsed = parseDiagnosis(result.content);
        const diagnosis = parsed
          ? buildDiagnosis(parsed, image.fileName, result.model)
          : buildFallbackDiagnosis('failed', image.fileName, 'Risposta vision non leggibile.');
        updateWorkingMemory(threadId, { photoDiagnosis: diagnosis });
        getAnalyticsService().capture({
          distinctId: userId ?? 'system',
          event: 'diagnosis_produced',
          properties: {
            status: diagnosis.status,
            candidate_count: diagnosis.candidates.length,
            top_confidence: diagnosis.candidates[0]?.confidence ?? 0,
            has_crop_guess: Boolean(diagnosis.cropGuess),
          },
        });
        return buildToolResult(diagnosis);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
        const diagnosis = buildFallbackDiagnosis('failed', image.fileName, msg);
        updateWorkingMemory(threadId, { photoDiagnosis: diagnosis });
        return buildToolResult(diagnosis);
      }
    },
  });
}
