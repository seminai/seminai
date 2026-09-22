import type { Response } from 'express';
import type { QdcApiResponse, QdcTableResult } from '../../services/integrations/qdc_imageline';
import { parseTableToRecords } from '../../services/integrations/qdc_imageline';
import { mapQdcError } from './qdc-facade-errors';
import { resolveQdcApiForUser } from './resolve-qdc-api';
import { auditQdcWrite } from './qdc-write-audit';
import type { QdcImageLineRestApi } from '../../services/integrations/qdc_imageline';

export function sendSuccess(response: Response, data: unknown): Response {
  return response.json({ status: 'success', data });
}

export function sendQdcEnvelope(response: Response, payload: QdcApiResponse): Response {
  return sendSuccess(response, {
    message: payload.message,
    result: payload.result ?? null,
    records: parseTableToRecords(payload.result as QdcTableResult | undefined),
  });
}

export async function runQdcRead<T>(
  userId: string,
  fn: (api: QdcImageLineRestApi) => Promise<T>,
): Promise<T> {
  const api = await resolveQdcApiForUser(userId);
  try {
    return await fn(api);
  } catch (error) {
    throw mapQdcError(error);
  }
}

export async function runQdcWrite<T>(
  userId: string,
  method: string,
  meta: object,
  fn: (api: QdcImageLineRestApi) => Promise<T>,
): Promise<T> {
  const api = await resolveQdcApiForUser(userId);
  try {
    const result = await fn(api);
    auditQdcWrite({ userId, method, ok: true, meta });
    return result;
  } catch (error) {
    auditQdcWrite({
      userId,
      method,
      ok: false,
      meta,
      error: error instanceof Error ? error.message : String(error),
    });
    throw mapQdcError(error);
  }
}
