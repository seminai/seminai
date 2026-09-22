import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export function prismaProductionUnitRepositoryToDateNullable(this: PrismaProductionUnitRepositoryContext, value: string | Date | null | undefined): Date | null | undefined {
    if (typeof value === 'undefined') return undefined;
    if (value === null) return null;
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
