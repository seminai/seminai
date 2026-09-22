import { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';

export type ProductionUnitBulkInput = Readonly<{
  name: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  allocations: Array<{ fieldId: string; areaHa: number }>;
  protectionStructure: string;
  areaHa?: number;
  startDate: unknown;
  floweringDate: unknown;
  harvestingDate: unknown;
  endDate: unknown;
  occupazione?: string | null;
  destinazioneDiUso?: string | null;
  acquaTotalePeridoL?: number | null;
}>;

type NormalizedProductionUnitBulk = Omit<
  ProductionUnitBulkInput,
  'startDate' | 'floweringDate' | 'harvestingDate' | 'endDate'
> &
  Readonly<{
    startDate: Date | null;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    endDate: Date | null;
  }>;

const parseDateNullable = (value: unknown, fieldName: string): Date | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  throw AppError.badRequest(`Invalid date format for ${fieldName}`, 'INVALID_DATE_FORMAT');
};

export const normalizeBulkProductionUnits = (
  units: ProductionUnitBulkInput[],
): NormalizedProductionUnitBulk[] => {
  if (!Array.isArray(units)) {
    throw AppError.badRequest('Missing productionUnits array', 'MISSING_PRODUCTION_UNITS');
  }
  return units.map((unit, index) => ({
    ...unit,
    startDate: parseDateNullable(unit.startDate, `productionUnits[${index}].startDate`),
    floweringDate: parseDateNullable(
      unit.floweringDate,
      `productionUnits[${index}].floweringDate`,
    ),
    harvestingDate: parseDateNullable(
      unit.harvestingDate,
      `productionUnits[${index}].harvestingDate`,
    ),
    endDate: parseDateNullable(unit.endDate, `productionUnits[${index}].endDate`),
  }));
};

export const resolveProductionUnitCompanyId = (request: Request): string | null => {
  const bodyCompanyId = (request.body as { companyId?: string })?.companyId;
  if (typeof bodyCompanyId === 'string' && bodyCompanyId.trim().length > 0) {
    return bodyCompanyId;
  }
  const queryCompanyId = request.query.companyId;
  if (typeof queryCompanyId === 'string' && queryCompanyId.trim().length > 0) {
    return queryCompanyId;
  }
  return null;
};
