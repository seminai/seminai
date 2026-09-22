import { getVenetoPcgComuneCode } from './veneto-pcg-cadastral-code-map';
import { normalizePcgCadastralNumber } from './veneto-pcg-number-utils';

export interface VenetoPcgParticleReference {
  readonly comune: string;
  readonly codiceNazionale: string | null;
  readonly sezione: string | null;
  readonly foglio: string;
  readonly particella: string;
}

interface CurrentCadastralContext {
  readonly comune: string;
  readonly sezione: string | null;
}

export function parseVenetoPcgParticelle(raw: string): readonly VenetoPcgParticleReference[] {
  const segments = raw
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+-\s+|;/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const references: VenetoPcgParticleReference[] = [];
  let context: CurrentCadastralContext = { comune: '', sezione: null };
  for (const segment of segments) {
    const parsed = parseSegment(segment, context);
    if (!parsed) continue;
    context = parsed.context;
    references.push(...parsed.references);
  }
  return references;
}

function parseSegment(
  segment: string,
  context: CurrentCadastralContext,
): {
  readonly context: CurrentCadastralContext;
  readonly references: readonly VenetoPcgParticleReference[];
} | null {
  const match = segment.match(/^(?:(.*?)\s+)?FG\s+(\d+)\s+PT\s+(.+)$/i);
  if (!match) return null;
  const nextContext = resolveContext(match[1], context);
  const foglio = normalizePcgCadastralNumber(match[2]);
  const particelle = match[3]
    .split(',')
    .map((value) => normalizePcgCadastralNumber(value))
    .filter(Boolean);
  const references = particelle.map((particella) => ({
    comune: nextContext.comune,
    codiceNazionale: getVenetoPcgComuneCode(nextContext.comune),
    sezione: nextContext.sezione,
    foglio,
    particella,
  }));
  return { context: nextContext, references };
}

function resolveContext(
  rawPrefix: string | undefined,
  previous: CurrentCadastralContext,
): CurrentCadastralContext {
  const prefix = rawPrefix?.trim();
  if (!prefix) return previous;
  const sectionMatch = prefix.match(/^(.+?)\s+SZ\s+([A-Z0-9]+)$/i);
  if (sectionMatch) {
    return {
      comune: normalizeComune(sectionMatch[1]),
      sezione: sectionMatch[2].trim().toUpperCase(),
    };
  }
  return { comune: normalizeComune(prefix), sezione: null };
}

function normalizeComune(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}
