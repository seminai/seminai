import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export function prismaProductionUnitRepositoryToDate(this: PrismaProductionUnitRepositoryContext, value: string | Date | null | undefined): Date | undefined {
    if (value === null || typeof value === 'undefined') return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid date format: ${value}`);
      }
      return date;
    }
    return undefined;
  }
