import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryFindExistingByShapefileData(this: PrismaFieldRepositoryContext, field: Field): Promise<{ id: string } | null> {
    const hasPolygonWgs84 = field.polygon !== null;
    const hasPolygonGaussBoaga = field.polygonGaussBoaga !== null;
    const hasCoordinatesWgs84 = field.coordinates.length >= 2;
    const hasCoordinatesGaussBoaga = field.coordinatesGaussBoaga.length >= 2;
    if (
      !hasPolygonWgs84 &&
      !hasPolygonGaussBoaga &&
      !hasCoordinatesWgs84 &&
      !hasCoordinatesGaussBoaga
    ) {
      return null;
    }

    const incomingPolygonWgs84 = hasPolygonWgs84 ? JSON.stringify(field.polygon) : null;
    const incomingPolygonGaussBoaga = hasPolygonGaussBoaga
      ? JSON.stringify(field.polygonGaussBoaga)
      : null;
    const candidates = await this.prisma.field.findMany({
      where: { companyId: field.companyId },
      select: {
        id: true,
        polygon: true,
        polygonGaussBoaga: true,
        coordinates: true,
        coordinatesGaussBoaga: true,
        gisHa: true,
        sauHa: true,
      },
    });

    for (const candidate of candidates) {
      if (incomingPolygonGaussBoaga && candidate.polygonGaussBoaga) {
        if (JSON.stringify(candidate.polygonGaussBoaga) === incomingPolygonGaussBoaga) {
          return { id: candidate.id };
        }
      }
      if (incomingPolygonWgs84 && candidate.polygon) {
        if (JSON.stringify(candidate.polygon) === incomingPolygonWgs84) {
          return { id: candidate.id };
        }
      }
      if (hasCoordinatesGaussBoaga) {
        const sameCoordinatesGaussBoaga = this.areCoordinatesClose(
          field.coordinatesGaussBoaga,
          candidate.coordinatesGaussBoaga ?? [],
          0.5,
        );
        if (sameCoordinatesGaussBoaga) {
          return { id: candidate.id };
        }
      }
      if (hasCoordinatesWgs84) {
        const sameCoordinatesWgs84 = this.areCoordinatesClose(
          field.coordinates,
          candidate.coordinates ?? [],
          0.00001,
        );
        if (sameCoordinatesWgs84) {
          const hasComparableArea = field.gisHa != null && candidate.gisHa != null;
          if (!hasComparableArea) return { id: candidate.id };
          if (this.areNumbersClose(field.gisHa as number, candidate.gisHa as number, 0.01)) {
            return { id: candidate.id };
          }
        }
      }
      if (field.sauHa != null && candidate.sauHa != null && hasCoordinatesWgs84) {
        const sameCoordinatesWgs84 = this.areCoordinatesClose(
          field.coordinates,
          candidate.coordinates ?? [],
          0.00001,
        );
        if (sameCoordinatesWgs84 && this.areNumbersClose(field.sauHa, candidate.sauHa, 0.01)) {
          return { id: candidate.id };
        }
      }
    }
    return null;
  }
