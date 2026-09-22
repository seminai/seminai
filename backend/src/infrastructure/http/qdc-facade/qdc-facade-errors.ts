import { AppError } from '../../../domain/errors/AppError';
import { QdcApiError } from '../../services/integrations/qdc_imageline';

function isHttpStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 400 && status < 600;
}

/** Maps QDC client/auth failures onto AppError so the global handler can serialize them. */
export function mapQdcError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof QdcApiError) {
    const status = isHttpStatus(error.httpStatus) ? error.httpStatus : 502;
    return new AppError(status, error.message, error.code ?? 'QDC_UPSTREAM');
  }
  const message = error instanceof Error ? error.message : String(error);
  return AppError.internal(message, 'QDC_ERROR');
}
