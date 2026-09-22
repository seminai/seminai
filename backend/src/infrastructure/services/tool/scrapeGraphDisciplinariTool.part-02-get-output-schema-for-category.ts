import { DisciplinariExtractionCategory } from '../integrations/scrapegraph';
import type { DisciplinariMetadata } from '../../../domain/dtos/disciplinari.dto';
import { DisciplinariMetadataSchema } from '../integrations/scrapegraph/schemas';

// ============================================================
// Output Schemas for ScrapeGraph
// ============================================================

export function getOutputSchemaForCategory(
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

export function detectCategoryFromUrl(url: string): DisciplinariExtractionCategory {
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

export function mapToMetadata(data: unknown): DisciplinariMetadata | null {
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
