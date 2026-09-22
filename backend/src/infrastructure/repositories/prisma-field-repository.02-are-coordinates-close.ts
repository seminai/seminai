import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export function prismaFieldRepositoryAreCoordinatesClose(this: PrismaFieldRepositoryContext, a: readonly number[], b: readonly number[], tolerance: number): boolean {
    if (a.length < 2 || b.length < 2) return false;
    return (
      this.areNumbersClose(a[0], b[0], tolerance) && this.areNumbersClose(a[1], b[1], tolerance)
    );
  }
