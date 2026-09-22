import { z } from 'zod';
import type { SeminaiHttpClient } from '../../client/http.js';
import { SeminaiHttpError } from '../../client/http-errors.js';
import { errorContent, jsonContent } from '../types.js';

export const idAziendaShape = z
  .number()
  .int()
  .positive()
  .describe('QDC company id (id_azienda). Resolve it with qdc_list_companies first.');

export const periodShape = {
  dataPeriodoDa: z
    .string()
    .optional()
    .describe(
      "Period start as 'gg/mm/aaaa' or 'yyyy-mm-dd'. Default: one year before dataPeriodoA.",
    ),
  dataPeriodoA: z
    .string()
    .optional()
    .describe("Period end as 'gg/mm/aaaa' or 'yyyy-mm-dd'. Default: today. Max window 365 days."),
};

export const compactShape = z
  .boolean()
  .optional()
  .default(true)
  .describe('When true (default), caps list payloads to 200 records to keep agent context small.');

export const confirmShape = z
  .boolean()
  .describe('Must be true to execute this write against the official QDC logbook.');

const MAX_COMPACT_RECORDS = 200;

export const DESTRUCTIVE_ANNOTATIONS = {
  destructiveHint: true,
  readOnlyHint: false,
  openWorldHint: true,
} as const;

export const READ_ANNOTATIONS = {
  destructiveHint: false,
  readOnlyHint: true,
  openWorldHint: true,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unwrapEnvelope(data: unknown): unknown {
  if (isRecord(data) && data.status === 'success' && 'data' in data) {
    return data.data;
  }
  return data;
}

export function compactPayload(payload: unknown, compact: boolean): unknown {
  if (!compact || !isRecord(payload)) {
    return payload;
  }
  const records = payload.records;
  if (!Array.isArray(records) || records.length <= MAX_COMPACT_RECORDS) {
    return payload;
  }
  return {
    ...payload,
    records: records.slice(0, MAX_COMPACT_RECORDS),
    truncated: true,
    totalCount: records.length,
  };
}

export function toQdcError(err: unknown, context: string): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiHttpError) {
    return errorContent(`QDC/Seminai API error during ${context} (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error during ${context}: ${(err as Error).message}`);
}

export async function qdcGet(
  http: SeminaiHttpClient,
  path: string,
  query: Record<string, string | number | boolean | readonly number[] | undefined>,
  compact: boolean,
  context: string,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>(path, { query });
    return jsonContent(compactPayload(unwrapEnvelope(data), compact));
  } catch (err) {
    return toQdcError(err, context);
  }
}

export async function qdcMutate(
  http: SeminaiHttpClient,
  method: 'post' | 'delete',
  path: string,
  options: { query?: Record<string, string | number | boolean | undefined>; body?: unknown },
  confirm: boolean,
  context: string,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  if (!confirm) {
    return errorContent(
      `Refusing ${context}: pass confirm=true to write to the official QDC logbook.`,
    );
  }
  try {
    const data =
      method === 'post'
        ? await http.post<unknown>(path, options)
        : await http.delete<unknown>(path, options);
    return jsonContent(unwrapEnvelope(data));
  } catch (err) {
    return toQdcError(err, context);
  }
}
