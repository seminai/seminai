/**
 * Lightweight IT/EN language detector for the Dosage ReAct Agent.
 *
 * Used to mirror the user's input language in static (non-LLM) outputs such as
 * follow-up suggestions. The LLM itself handles its response language via the
 * SOUL_PROMPT directive — this helper only routes deterministic UI strings.
 *
 * Heuristic-based, zero dependencies, no LLM calls. For two languages (IT, EN)
 * a marker-token approach is sufficient and fully testable.
 */

export type SupportedLanguage = 'it' | 'en';

const IT_MARKERS =
  /\b(è|però|così|gli|della|delle|degli|quando|vuoi|sono|hai|già|più|perché|ettari|vigneto|trattamento|dosaggio|fitofarmaco|fitosanitario|magazzino|campo|raccolta|fioritura)\b/gi;

const EN_MARKERS =
  /\b(the|and|you|is|are|do|does|can|would|should|hectare|vineyard|treatment|dosage|pesticide|stock|field|harvest|bloom|please)\b/gi;

const MIN_WORDS_FOR_DETECTION = 3;

/**
 * Detects whether a user message is in Italian or English.
 * Defaults to Italian on empty, very short, or ambiguous inputs.
 */
export function detectLanguage(text: string | undefined | null): SupportedLanguage {
  if (!text) return 'it';
  const trimmed = text.trim();
  if (!trimmed) return 'it';
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= MIN_WORDS_FOR_DETECTION) return 'it';
  const itHits = (trimmed.match(IT_MARKERS) ?? []).length;
  const enHits = (trimmed.match(EN_MARKERS) ?? []).length;
  return enHits > itHits ? 'en' : 'it';
}
