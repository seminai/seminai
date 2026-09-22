import { z } from 'zod';

/**
 * Schema for metadata extraction from disciplinari
 */
export const DisciplinariMetadataSchema = z.object({
  region: z.string().nullable(),
  year: z.number().nullable(),
  version: z.string().nullable(),
  title: z.string().nullable(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  isExpired: z.boolean().default(false),
});

export type DisciplinariMetadataOutput = z.infer<typeof DisciplinariMetadataSchema>;

/**
 * Schema for glossary definition
 */
export const GlossaryDefinitionSchema = z.object({
  term: z.string(),
  definition: z.string(),
});

/**
 * Schema for rules extraction
 */
export const DisciplinariRulesSchema = z.object({
  generalPrinciples: z.array(z.string()).default([]),
  prohibitions: z.array(z.string()).default([]),
  mandatoryActions: z.array(z.string()).default([]),
  definitions: z.array(GlossaryDefinitionSchema).default([]),
});

export type DisciplinariRulesOutput = z.infer<typeof DisciplinariRulesSchema>;

/**
 * Schema for dose information
 */
export const DoseInfoSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  unit: z.string().nullable(),
  notes: z.string().nullable(),
});

/**
 * Schema for application limits
 */
export const ApplicationLimitsSchema = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  scope: z.enum(['anno', 'ciclo colturale', 'stagione', 'finestra fenologica']).nullable(),
});

/**
 * Schema for allowed intervention
 */
export const AllowedInterventionSchema = z.object({
  productOrActive: z.object({
    name: z.string(),
    normalized: z.string().nullable(),
  }),
  formulation: z.string().nullable(),
  dose: DoseInfoSchema,
  applications: ApplicationLimitsSchema,
  interval: z.object({
    minDays: z.number().nullable(),
  }),
  phi: z
    .object({
      preharvestIntervalDays: z.number().nullable(),
    })
    .nullable(),
  phenology: z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  constraints: z.array(z.string()).default([]),
  environmentalConstraints: z.array(z.string()).default([]),
  resistanceManagement: z.array(z.string()).default([]),
  notes: z.string().nullable(),
  sourceLocator: z
    .object({
      page: z.number().nullable(),
      tableId: z.string().nullable(),
      rowHint: z.string().nullable(),
    })
    .default({ page: null, tableId: null, rowHint: null }),
});

export type AllowedInterventionOutput = z.infer<typeof AllowedInterventionSchema>;

/**
 * Schema for defense target
 */
export const DefenseTargetSchema = z.object({
  target: z.object({
    name: z.string(),
    type: z.enum(['insetto', 'fungo', 'infestante', 'altro']).default('altro'),
  }),
  monitoring: z.array(z.string()).default([]),
  agronomicMeasures: z.array(z.string()).default([]),
  biologicalMeasures: z.array(z.string()).default([]),
  interventions: z.array(AllowedInterventionSchema).default([]),
});

export type DefenseTargetOutput = z.infer<typeof DefenseTargetSchema>;

/**
 * Schema for scope entity
 */
export const ScopeEntitySchema = z.object({
  crop: z.object({
    name: z.string(),
    group: z.string().nullable(),
  }),
  section: z.object({
    name: z.string(),
  }),
  subsection: z
    .object({
      name: z.string().nullable(),
    })
    .nullable(),
});

export type ScopeEntityOutput = z.infer<typeof ScopeEntitySchema>;

/**
 * Combined schema for full extraction
 */
export const DisciplinariExtractionSchema = z.object({
  metadata: DisciplinariMetadataSchema.nullable(),
  rules: DisciplinariRulesSchema.nullable(),
  defenseTargets: z.array(DefenseTargetSchema).default([]),
  scopeEntities: z.array(ScopeEntitySchema).default([]),
  confidence: z.number().min(0).max(100).default(0),
  errors: z.array(z.string()).default([]),
});

export type DisciplinariExtractionOutput = z.infer<typeof DisciplinariExtractionSchema>;
