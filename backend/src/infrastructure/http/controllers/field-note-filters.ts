import { FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';
import { FieldNoteFiltersDto } from '../../../domain/dtos/field-note.dto';
import { Request } from 'express';

export const parseFieldNoteFilters = (query: Request['query']): FieldNoteFiltersDto => ({
  category: parseEnum(query.category, Object.values(FieldNoteCategory)),
  status: parseEnum(query.status, Object.values(FieldNoteProcessingStatus)),
  fieldId: parseString(query.fieldId),
  productionUnitId: parseString(query.productionUnitId),
  productId: parseString(query.productId),
  startDate: parseDate(query.startDate),
  endDate: parseDate(query.endDate),
  hasLocation: parseBoolean(query.hasLocation),
});

const parseEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => {
  const parsed = parseString(value);
  return parsed && allowed.includes(parsed as T) ? (parsed as T) : undefined;
};

const parseString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};
