import { ConfirmExtractionRequestDTO } from '../../../domain/dtos/extraction-confirm-request.dto';
import { AppError } from '../../../domain/errors/AppError';
import { ExtractionDataValidator } from '../../services/extraction/extraction-data-validator';

export const parseExtractionConfirmRequest = (
  body: unknown,
  category: string,
): ConfirmExtractionRequestDTO | undefined => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const payload = body as Record<string, unknown>;
  const warehouseId = parseOptionalString(payload.warehouseId);
  const rawInvoiceEntries = payload.invoiceEntries;
  if (rawInvoiceEntries !== undefined && !Array.isArray(rawInvoiceEntries)) {
    throw AppError.badRequest(
      'Invalid invoiceEntries payload: expected an array',
      'INVALID_CONFIRM_PAYLOAD',
    );
  }
  return {
    warehouseId,
    invoiceEntries: Array.isArray(rawInvoiceEntries)
      ? ExtractionDataValidator.parseConfirmEntries(category, rawInvoiceEntries)
      : undefined,
    allowReviewOverride: parseOptionalBoolean(payload.allowReviewOverride),
  };
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw AppError.badRequest('Invalid allowReviewOverride payload', 'INVALID_CONFIRM_PAYLOAD');
  }
  return value;
};
