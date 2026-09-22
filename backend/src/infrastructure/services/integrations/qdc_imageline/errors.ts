/**
 * Errors for the ImageLine QuadernoDiCampagna (QDC) API integration.
 */

interface QdcApiErrorOptions {
  readonly httpStatus: number;
  readonly code?: string;
  readonly errorDescription?: string;
}

/**
 * Error raised when the QDC REST API responds with a non-2xx status.
 * `code` carries the OAuth-style error identifier when present
 * (typically one of `QdcErrorCode`, e.g. "invalid_scope", "access_denied").
 */
export class QdcApiError extends Error {
  public readonly httpStatus: number;
  public readonly code?: string;
  public readonly errorDescription?: string;

  constructor(options: QdcApiErrorOptions) {
    const detail = options.errorDescription ?? options.code ?? 'unknown error';
    super(`QDC API error (HTTP ${options.httpStatus}): ${detail}`);
    this.name = 'QdcApiError';
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.errorDescription = options.errorDescription;
  }
}
