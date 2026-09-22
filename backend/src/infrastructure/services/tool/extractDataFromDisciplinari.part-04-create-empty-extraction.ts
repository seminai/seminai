import { DisciplinariExtractedData, DisciplinariMetadata, DisciplinariRules, ScopeEntity } from '../../../domain/dtos/disciplinari.dto';
import { sanitizeDefenseTargets } from './extractDataFromDisciplinari.part-05-sanitize-defense-targets';

/**
 * Creates an empty extraction result with default values.
 */
export function createEmptyExtraction(errors: string[] = []): DisciplinariExtractedData {
  return {
    documentMetadata: {
      region: 'Unknown',
      year: new Date().getFullYear(),
      version: null,
      title: 'Unknown',
      sourceUrlOrFile: null,
      validFrom: null,
      validUntil: null,
      isExpired: false,
    },
    scopeEntities: [],
    rules: {
      generalPrinciples: [],
      prohibitions: [],
      mandatoryActions: [],
      definitions: [],
    },
    defenseTargets: [],
    normalizationOutputs: null,
    extractionConfidence: 0,
    extractionErrors: errors,
  };
}

/**
 * Sanitizes and validates the extracted data.
 */
export function sanitizeDisciplinariExtraction(raw: unknown): DisciplinariExtractedData {
  if (!raw || typeof raw !== 'object') {
    return createEmptyExtraction(['Invalid extraction result']);
  }

  const data = raw as Record<string, unknown>;

  const metadata = sanitizeMetadata(data.documentMetadata);
  const scopeEntities = sanitizeScopeEntities(data.scopeEntities);
  const rules = sanitizeRules(data.rules);
  const defenseTargets = sanitizeDefenseTargets(data.defenseTargets);

  const confidence =
    typeof data.extractionConfidence === 'number'
      ? Math.min(100, Math.max(0, data.extractionConfidence))
      : 50;

  const errors = Array.isArray(data.extractionErrors)
    ? data.extractionErrors.filter((e): e is string => typeof e === 'string')
    : [];

  return {
    documentMetadata: metadata,
    scopeEntities,
    rules,
    defenseTargets,
    normalizationOutputs: null,
    extractionConfidence: confidence,
    extractionErrors: errors,
  };
}

export function sanitizeMetadata(raw: unknown): DisciplinariMetadata {
  const defaultMetadata: DisciplinariMetadata = {
    region: 'Unknown',
    year: new Date().getFullYear(),
    version: null,
    title: 'Unknown',
    sourceUrlOrFile: null,
    validFrom: null,
    validUntil: null,
    isExpired: false,
  };

  if (!raw || typeof raw !== 'object') {
    return defaultMetadata;
  }

  const data = raw as Record<string, unknown>;

  const year =
    typeof data.year === 'number'
      ? data.year
      : parseInt(String(data.year), 10) || defaultMetadata.year;

  let validUntil = typeof data.validUntil === 'string' ? data.validUntil : null;
  if (!validUntil && year) {
    validUntil = `${year}-12-31`;
  }

  const isExpired = validUntil ? new Date(validUntil) < new Date() : false;

  return {
    region: typeof data.region === 'string' ? data.region : defaultMetadata.region,
    year,
    version: typeof data.version === 'string' ? data.version : null,
    title: typeof data.title === 'string' ? data.title : defaultMetadata.title,
    sourceUrlOrFile: typeof data.sourceUrlOrFile === 'string' ? data.sourceUrlOrFile : null,
    validFrom: typeof data.validFrom === 'string' ? data.validFrom : null,
    validUntil,
    isExpired,
  };
}

export function sanitizeScopeEntities(raw: unknown): ScopeEntity[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      crop: {
        name:
          typeof item.crop === 'object' && item.crop !== null
            ? String((item.crop as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        group:
          typeof item.crop === 'object' && item.crop !== null
            ? ((item.crop as Record<string, unknown>).group as string) || null
            : null,
      },
      section: {
        name:
          typeof item.section === 'object' && item.section !== null
            ? String((item.section as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
      },
      subsection:
        typeof item.subsection === 'object' && item.subsection !== null
          ? { name: ((item.subsection as Record<string, unknown>).name as string) || null }
          : null,
    }));
}

export function sanitizeRules(raw: unknown): DisciplinariRules {
  const defaultRules: DisciplinariRules = {
    generalPrinciples: [],
    prohibitions: [],
    mandatoryActions: [],
    definitions: [],
  };

  if (!raw || typeof raw !== 'object') {
    return defaultRules;
  }

  const data = raw as Record<string, unknown>;

  return {
    generalPrinciples: sanitizeStringArray(data.generalPrinciples),
    prohibitions: sanitizeStringArray(data.prohibitions),
    mandatoryActions: sanitizeStringArray(data.mandatoryActions),
    definitions: Array.isArray(data.definitions)
      ? data.definitions
          .filter((d): d is Record<string, unknown> => d !== null && typeof d === 'object')
          .map((d) => ({
            term: String(d.term || ''),
            definition: String(d.definition || ''),
          }))
      : [],
  };
}

export function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}
