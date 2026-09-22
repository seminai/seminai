import { Request } from 'express';
import { FileExtractionStatus } from '@prisma/client';
import {
  FileExtractionListSortBy,
  ListFileExtractionsQuery,
  ResolvedCategory,
} from '../../../domain/dtos/file-extraction.dto';
import { AppError } from '../../../domain/errors/AppError';

const ALLOWED_STATUSES: readonly FileExtractionStatus[] = [
  'LOADING',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ERROR',
];
const ALLOWED_CATEGORIES: readonly ResolvedCategory[] = [
  'fields',
  'production_units',
  'agricultural',
  'invoice',
  'ddt',
  'stock',
];
const ALLOWED_SORT_FIELDS: readonly FileExtractionListSortBy[] = [
  'updatedAt',
  'fileName',
  'status',
  'category',
];
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseFileExtractionListQuery = (
  query: Request['query'],
): ListFileExtractionsQuery => {
  const page = parsePositiveInt(query.page, 1, 'page');
  const pageSize = Math.min(parsePositiveInt(query.pageSize, 25, 'pageSize'), 100);
  const status = parseCsvEnumList<FileExtractionStatus>(
    query.status,
    ALLOWED_STATUSES,
    'status',
  );
  const category = parseCsvEnumList<ResolvedCategory>(
    query.category,
    ALLOWED_CATEGORIES,
    'category',
  );
  const sortByRaw = parseOptionalString(query.sortBy);
  const sortBy = ALLOWED_SORT_FIELDS.includes(sortByRaw as FileExtractionListSortBy)
    ? (sortByRaw as FileExtractionListSortBy)
    : 'updatedAt';
  const fileNamesRaw = parseOptionalString(query.fileNames);
  const updatedAtFrom = parseDateBoundary(query.updatedAtFrom, 'updatedAtFrom', 'start');
  const updatedAtTo = parseDateBoundary(query.updatedAtTo, 'updatedAtTo', 'end');
  if (updatedAtFrom && updatedAtTo && updatedAtFrom > updatedAtTo) {
    throw AppError.badRequest(
      'updatedAtFrom must be before or equal to updatedAtTo',
      'INVALID_UPDATEDAT_RANGE',
    );
  }
  return {
    companyId: parseOptionalString(query.companyId),
    page,
    pageSize,
    includeGenerated: parseBoolean(query.includeGenerated),
    q: parseOptionalString(query.q),
    fileNames: fileNamesRaw
      ? fileNamesRaw
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      : undefined,
    status,
    category,
    sortBy,
    sortOrder: parseOptionalString(query.sortOrder) === 'asc' ? 'asc' : 'desc',
    updatedAtFrom,
    updatedAtTo,
  };
};

export const parseOptionalQueryString = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalString = parseOptionalQueryString;

const parseDateBoundary = (
  raw: unknown,
  field: string,
  boundary: 'start' | 'end',
): Date | undefined => {
  const value = parseOptionalString(raw);
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    if (!value) return undefined;
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
  const parsed = new Date(`${value}${suffix}`);
  if (Number.isNaN(parsed.getTime())) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return parsed;
};

const parseBoolean = (raw: unknown): boolean | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  throw AppError.badRequest('Invalid includeGenerated query param', 'INVALID_INCLUDEGENERATED');
};

const parsePositiveInt = (raw: unknown, fallback: number, field: string): number => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return value;
};

const parseCsvEnumList = <T extends string>(
  raw: unknown,
  allowedValues: readonly T[],
  field: string,
): readonly T[] | undefined => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is T => value.length > 0 && allowedValues.includes(value as T));
  if (values.length === 0) {
    throw AppError.badRequest(`Invalid ${field} query param`, `INVALID_${field.toUpperCase()}`);
  }
  return values;
};
