import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export function prismaFieldRepositoryAreNumbersClose(this: PrismaFieldRepositoryContext, a: number, b: number, tolerance: number): boolean {
    return Math.abs(a - b) <= tolerance;
  }
