import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_PRODUCTION_UNITS_TOOL_NAME = 'seminai_list_production_units';
export const LIST_PRODUCTION_UNITS_TOOL_DESCRIPTION =
  'List all production units accessible to the authenticated user across their companies. ' +
  'By default returns a compact projection (id, name, cropName, variety, areaHa, dates, company) ' +
  'to keep agent context small; set compact=false to receive the full nested payload.';

export const listProductionUnitsShape = {
  compact: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'When true (default), returns minimal fields per production unit suitable for agent ' +
        'discovery. When false, returns the full backend payload including crop details, ' +
        'fields, cycle metadata (large, may saturate agent context).',
    ),
};

interface CompactProductionUnit {
  id: string | null;
  name: string | null;
  cropName: string | null;
  variety: string | null;
  areaHa: number | null;
  startDate: string | null;
  endDate: string | null;
  companyId: string | null;
  companyName: string | null;
}

type Unknown = Record<string, unknown>;

function isRecord(value: unknown): value is Unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function projectUnit(entry: unknown): CompactProductionUnit {
  if (!isRecord(entry)) {
    return emptyCompactUnit();
  }
  const inner = isRecord(entry.productionUnit) ? entry.productionUnit : entry;
  return {
    id: asString(inner.id),
    name: asString(inner.name),
    cropName: asString(inner.cropName),
    variety: asString(inner.variety),
    areaHa: asNumber(inner.areaHa),
    startDate: asString(inner.startDate),
    endDate: asString(inner.endDate),
    companyId: asString(entry.companyId),
    companyName: asString(entry.companyName),
  };
}

function emptyCompactUnit(): CompactProductionUnit {
  return {
    id: null,
    name: null,
    cropName: null,
    variety: null,
    areaHa: null,
    startDate: null,
    endDate: null,
    companyId: null,
    companyName: null,
  };
}

/**
 * Reshapes the backend response into a compact list. Defensive against the
 * envelope shape: accepts `{ data: { productionUnits: [...] } }` (current),
 * `{ data: [...] }` (alt), or a bare array.
 */
export function compactProductionUnitsResponse(payload: unknown): unknown {
  const units = extractUnitsArray(payload);
  if (!units) return payload;
  const compact = units.map(projectUnit);
  return { status: 'success', data: { productionUnits: compact, count: compact.length } };
}

function extractUnitsArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return null;
  if (Array.isArray(payload.productionUnits)) return payload.productionUnits;
  if (isRecord(payload.data)) {
    if (Array.isArray(payload.data.productionUnits)) return payload.data.productionUnits;
    if (Array.isArray(payload.data)) return payload.data;
  }
  return null;
}

export async function listProductionUnitsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof listProductionUnitsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>('/production-units');
    return jsonContent(args.compact ? compactProductionUnitsResponse(data) : data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerProductionUnitsTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    LIST_PRODUCTION_UNITS_TOOL_NAME,
    LIST_PRODUCTION_UNITS_TOOL_DESCRIPTION,
    listProductionUnitsShape,
    (args) => listProductionUnitsHandler(http, args),
  );
};
