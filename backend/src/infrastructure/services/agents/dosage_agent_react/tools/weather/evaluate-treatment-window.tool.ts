import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../../repositories/Prisma';
import { evaluateTreatmentWindow } from '../../../../../../domain/services/treatment-weather/treatment-window-evaluator';
import { DEFAULT_TREATMENT_THRESHOLDS } from '../../../../../../domain/services/treatment-weather/thresholds';
import type { TreatmentApplicationWindowDto } from '../../../../../../domain/dtos/weather/treatment-application-window.dto';
import type { AgronomistAdviceDto } from '../../../../../../domain/dtos/weather/agronomist-advice.dto';
import { openMeteoService } from './open-meteo-singleton';
import { OPEN_METEO_DISABLED_MESSAGE, isOpenMeteoEnabledForUser } from './require-open-meteo';
import {
  weatherAdvisorService,
  type ProductSummary,
  type MachineSummary,
} from '../../../weather_advisor';

const schema = z
  .object({
    jobId: z
      .string()
      .optional()
      .describe('ID del Job di trattamento. Mutuamente esclusivo con fieldId.'),
    fieldId: z.string().optional().describe('ID del Field. Mutuamente esclusivo con jobId.'),
    plannedDate: z
      .string()
      .describe('Data/ora pianificata del trattamento (ISO-8601). Es. "2026-05-15T08:00:00".'),
    horizonHours: z.number().int().min(1).max(72).default(24),
  })
  .refine((d) => Boolean(d.jobId) || Boolean(d.fieldId), {
    message: 'Uno tra jobId e fieldId è obbligatorio',
    path: ['jobId'],
  });

interface FieldCoords {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface FieldVerdict extends TreatmentApplicationWindowDto {
  readonly fieldId: string;
  readonly fieldName: string;
  readonly coordinates: { readonly latitude: number; readonly longitude: number };
  readonly timezone: string;
}

/**
 * Tool: evaluate_treatment_window
 * Specialized weather verdict for a planned treatment. Resolves Field
 * coordinates from jobId or fieldId, fetches the forecast for each Field with
 * coordinates, and returns one verdict per Field plus a `skippedFields` count
 * for Fields that lacked coordinates.
 */
export function createEvaluateTreatmentWindowTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'evaluate_treatment_window',
    description: `Valuta se la data/ora pianificata di un trattamento è meteorologicamente adatta.
Risolve le coordinate dei Field (a partire da jobId o fieldId), interroga Open-Meteo per ognuno e applica le soglie operative agronomiche (vento, pioggia, temperatura, umidità + assenza di pioggia per 6h dopo l'applicazione).
Restituisce 'perField' (array con verdict per ogni Field georef del Job, ognuno con applicationWindows + risks) e 'skippedFields' (count dei Field senza coordinate).
Da preferire al tool generico 'get_weather_forecast' quando si pianifica o si discute il timing di un trattamento concreto.`,
    schema,
    func: async (args) => {
      const enabled = await isOpenMeteoEnabledForUser(userId);
      if (!enabled) {
        return JSON.stringify({ available: false, reason: OPEN_METEO_DISABLED_MESSAGE });
      }
      const resolved = await resolveFields(args);
      if ('error' in resolved) {
        return JSON.stringify({ available: false, reason: resolved.error });
      }
      const advice = await resolveThresholds(args, userId);
      const perField: FieldVerdict[] = [];
      let firstHorizonStart: string | undefined;
      let firstHorizonEnd: string | undefined;
      let firstEvaluatedAt: string | undefined;
      for (const coords of resolved.fields) {
        const forecast = await openMeteoService.fetchForecast({
          latitude: coords.latitude,
          longitude: coords.longitude,
          forecastDays: pickForecastDays(args.horizonHours),
        });
        if (!forecast.available) {
          return JSON.stringify({
            available: false,
            reason: `Forecast unavailable for field "${coords.fieldName}": ${forecast.reason}`,
          });
        }
        const verdict = evaluateTreatmentWindow({
          forecast,
          thresholds: advice.thresholds,
          plannedDate: args.plannedDate,
          horizonHours: args.horizonHours,
        });
        firstHorizonStart = firstHorizonStart ?? verdict.horizonStart;
        firstHorizonEnd = firstHorizonEnd ?? verdict.horizonEnd;
        firstEvaluatedAt = firstEvaluatedAt ?? verdict.evaluatedAt;
        perField.push({
          fieldId: coords.fieldId,
          fieldName: coords.fieldName,
          coordinates: { latitude: coords.latitude, longitude: coords.longitude },
          timezone: forecast.timezone,
          ...verdict,
        });
      }
      return JSON.stringify({
        available: true,
        perField,
        skippedFields: resolved.skippedFields,
        skippedFieldNames: resolved.skippedFieldNames,
        appliedThresholds: {
          values: advice.thresholds,
          source: advice.source,
          reasoning: advice.reasoning,
          confidence: advice.confidence,
          sourceModel: advice.sourceModel,
          warnings: advice.warnings,
        },
        evaluatedAt: firstEvaluatedAt,
        horizonStart: firstHorizonStart,
        horizonEnd: firstHorizonEnd,
      });
    },
  });
}

function pickForecastDays(horizonHours: number): number {
  return Math.min(7, Math.max(1, Math.ceil(horizonHours / 24)));
}

async function resolveThresholds(
  args: { jobId?: string; fieldId?: string },
  userId: string,
): Promise<AgronomistAdviceDto> {
  if (!args.jobId) {
    return {
      thresholds: DEFAULT_TREATMENT_THRESHOLDS,
      source: 'default-fallback',
      warnings: ['No Job context available (fieldId-only call), using generic default thresholds.'],
      contextHash: 'no-job-context',
    };
  }
  const ctx = await loadJobContext(args.jobId);
  if (!ctx) {
    return {
      thresholds: DEFAULT_TREATMENT_THRESHOLDS,
      source: 'default-fallback',
      warnings: ['Contesto prodotti/macchina non recuperabile.'],
      contextHash: 'job-context-unavailable',
    };
  }
  return weatherAdvisorService.adviseFor({
    products: ctx.products,
    machine: ctx.machine,
    userId,
    jobId: args.jobId,
  });
}

interface JobContext {
  readonly products: readonly ProductSummary[];
  readonly machine?: MachineSummary;
}

async function loadJobContext(jobId: string): Promise<JobContext | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      machine: { select: { name: true, identifier: true } },
      stocks: {
        select: {
          product: {
            select: {
              sku: true,
              name: true,
              type: true,
              category: true,
              labelMetadata: true,
            },
          },
        },
      },
    },
  });
  if (!job) return null;
  const products: ProductSummary[] = job.stocks
    .map((s) => s.product)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      category: String(p.category),
      type: p.type,
      labelCategoria: extractLabelCategoria(p.labelMetadata),
    }));
  const machine: MachineSummary | undefined = job.machine
    ? { name: job.machine.name, identifier: job.machine.identifier ?? null }
    : undefined;
  return { products, machine };
}

function extractLabelCategoria(labelMetadata: unknown): string | null {
  if (!labelMetadata || typeof labelMetadata !== 'object') return null;
  const obj = labelMetadata as Record<string, unknown>;
  const cat = obj['categoria'];
  return typeof cat === 'string' ? cat : null;
}

interface ResolvedFields {
  readonly fields: readonly FieldCoords[];
  readonly skippedFields: number;
  readonly skippedFieldNames: readonly string[];
}

async function resolveFields(args: {
  jobId?: string;
  fieldId?: string;
}): Promise<ResolvedFields | { error: string }> {
  if (args.fieldId) return resolveFromFieldId(args.fieldId);
  if (args.jobId) return resolveFromJobId(args.jobId);
  return { error: 'Né jobId né fieldId forniti' };
}

async function resolveFromFieldId(fieldId: string): Promise<ResolvedFields | { error: string }> {
  const field = await prisma.field.findUnique({
    where: { id: fieldId },
    select: { id: true, latitude: true, longitude: true, name: true },
  });
  if (!field) return { error: 'Campo non trovato' };
  if (field.latitude == null || field.longitude == null) {
    return {
      error: `Campo "${field.name}" privo di coordinate latitudine/longitudine.`,
    };
  }
  return {
    fields: [
      {
        fieldId: field.id,
        fieldName: field.name,
        latitude: field.latitude,
        longitude: field.longitude,
      },
    ],
    skippedFields: 0,
    skippedFieldNames: [],
  };
}

async function resolveFromJobId(jobId: string): Promise<ResolvedFields | { error: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      productionUnit: {
        select: {
          productionUnitsOnFields: {
            select: {
              field: {
                select: { id: true, latitude: true, longitude: true, name: true },
              },
            },
          },
        },
      },
    },
  });
  if (!job) return { error: 'Trattamento non trovato' };
  const fields = job.productionUnit.productionUnitsOnFields.map((p) => p.field);
  const withCoords: FieldCoords[] = [];
  const skippedNames: string[] = [];
  for (const f of fields) {
    if (f.latitude != null && f.longitude != null) {
      withCoords.push({
        fieldId: f.id,
        fieldName: f.name,
        latitude: f.latitude,
        longitude: f.longitude,
      });
    } else {
      skippedNames.push(f.name);
    }
  }
  if (withCoords.length === 0) {
    return {
      error:
        fields.length === 0
          ? "L'unità produttiva non ha campi associati."
          : `Nessuno dei ${fields.length} campi associati ha coordinate. Aggiungi latitudine/longitudine al campo per poter usare il meteo.`,
    };
  }
  return {
    fields: withCoords,
    skippedFields: skippedNames.length,
    skippedFieldNames: skippedNames,
  };
}
