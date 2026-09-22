import { FieldNote as PrismaFieldNote } from '@prisma/client';
import { FieldNote } from '../../domain/entities/FieldNote';
import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryFindNearbyFieldNotes(this: PrismaFieldNoteRepositoryContext, latitude: number, longitude: number, radiusMeters: number): Promise<FieldNote[]> {
    // Haversine formula approximation using raw SQL
    // Note: This is a simplified approach. For production, consider using PostGIS
    const radiusInDegrees = radiusMeters / 111320; // Rough conversion

    const fieldNotes = await this.prisma.$queryRaw<PrismaFieldNote[]>`
      SELECT *
      FROM "FieldNote"
      WHERE latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (
          POW(69.1 * (latitude - ${latitude}), 2) +
          POW(69.1 * (${longitude} - longitude) * COS(latitude / 57.3), 2)
        ) < POW(${radiusInDegrees * 69.1}, 2)
      ORDER BY (
        POW(69.1 * (latitude - ${latitude}), 2) +
        POW(69.1 * (${longitude} - longitude) * COS(latitude / 57.3), 2)
      )
    `;

    return fieldNotes.map((fn) =>
      FieldNote.fromPrisma({
        ...fn,
        operationDate: new Date(fn.operationDate),
        createdAt: new Date(fn.createdAt),
        updatedAt: new Date(fn.updatedAt),
      }),
    );
  }
