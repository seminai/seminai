import type { DisciplinariExtractedData, DisciplinariRules, DefenseTarget, ScopeEntity, AllowedIntervention, ApplicationLimits } from '../../../domain/dtos/disciplinari.dto';
import { DisciplinariRulesSchema, DefenseTargetSchema, ScopeEntitySchema } from '../integrations/scrapegraph/schemas';
import { PrismaDisciplinariExtractionRepository, DisciplinariExtractionInput } from '../../repositories/PrismaDisciplinariExtractionRepository';
import { prisma } from '../../repositories/Prisma';
import crypto from 'crypto';

export function mapToRules(data: unknown): DisciplinariRules | null {
  try {
    const parsed = DisciplinariRulesSchema.safeParse(data);
    if (!parsed.success) return null;

    return {
      generalPrinciples: parsed.data.generalPrinciples,
      prohibitions: parsed.data.prohibitions,
      mandatoryActions: parsed.data.mandatoryActions,
      definitions: parsed.data.definitions,
    };
  } catch {
    return null;
  }
}

export function mapToDefenseTargets(data: unknown): DefenseTarget[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const parsed = DefenseTargetSchema.safeParse(item);
      if (!parsed.success) return null;
      return parsed.data as DefenseTarget;
    })
    .filter((item): item is DefenseTarget => item !== null);
}

export function mapToScopeEntities(data: unknown): ScopeEntity[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item) => {
      const parsed = ScopeEntitySchema.safeParse(item);
      if (!parsed.success) return null;
      return parsed.data as ScopeEntity;
    })
    .filter((item): item is ScopeEntity => item !== null);
}

export function mapInterventionFromRaw(raw: unknown): AllowedIntervention {
  const item = raw as Record<string, unknown>;
  const productOrActive = item.productOrActive as Record<string, unknown> | undefined;
  const dose = item.dose as Record<string, unknown> | undefined;
  const applications = item.applications as Record<string, unknown> | undefined;
  const interval = item.interval as Record<string, unknown> | undefined;
  const phi = item.phi as Record<string, unknown> | undefined;
  const phenology = item.phenology as Record<string, unknown> | undefined;

  return {
    productOrActive: {
      name: String(productOrActive?.name ?? 'Unknown'),
      normalized: (productOrActive?.normalized as string) ?? null,
    },
    formulation: (item.formulation as string) ?? null,
    dose: {
      min: (dose?.min as number) ?? null,
      max: (dose?.max as number) ?? null,
      unit: (dose?.unit as string) ?? null,
      notes: (dose?.notes as string) ?? null,
    },
    applications: {
      min: (applications?.min as number) ?? null,
      max: (applications?.max as number) ?? null,
      scope: (applications?.scope as ApplicationLimits['scope']) ?? null,
    },
    interval: {
      minDays: (interval?.minDays as number) ?? null,
    },
    phi: phi
      ? {
          preharvestIntervalDays: (phi?.preharvestIntervalDays as number) ?? null,
        }
      : null,
    phenology: {
      from: (phenology?.from as string) ?? null,
      to: (phenology?.to as string) ?? null,
    },
    constraints: Array.isArray(item.constraints) ? (item.constraints as string[]) : [],
    environmentalConstraints: [],
    resistanceManagement: [],
    notes: (item.notes as string) ?? null,
    sourceLocator: { page: null, tableId: null, rowHint: null },
  };
}

// ============================================================
// Database Save Function
// ============================================================

export async function saveToDatabase(
  url: string,
  data: Partial<DisciplinariExtractedData>,
  confidence: number,
  userId?: string,
): Promise<string | undefined> {
  try {
    const repo = new PrismaDisciplinariExtractionRepository(prisma);
    const metadata = data.documentMetadata;

    if (!metadata) {
      console.warn('[SCRAPEGRAPH] Cannot save without metadata');
      return undefined;
    }

    const fileHash = crypto.createHash('sha256').update(url).digest('hex');

    const input: DisciplinariExtractionInput = {
      fileHash,
      fileName: url.split('/').pop() ?? 'web_extraction',
      sourceUrl: url,
      region: metadata.region,
      year: metadata.year,
      version: metadata.version ?? undefined,
      title: metadata.title,
      validFrom: metadata.validFrom ? new Date(metadata.validFrom) : undefined,
      validUntil: metadata.validUntil ? new Date(metadata.validUntil) : undefined,
      isExpired: metadata.isExpired,
      rawText: '',
      extractedData: data,
      extractionConfidence: confidence,
      extractionErrors: [],
      createdById: userId,
    };

    const extraction = await repo.upsertByHash(input);

    console.log(`[SCRAPEGRAPH] Saved to database with ID: ${extraction.id}`);
    return extraction.id;
  } catch (error) {
    console.error('[SCRAPEGRAPH] Database save failed:', error);
    return undefined;
  }
}
