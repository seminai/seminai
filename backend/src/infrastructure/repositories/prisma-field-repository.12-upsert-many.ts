import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryUpsertMany(this: PrismaFieldRepositoryContext, fields: Field[]): Promise<Field[]> {
    const results: Field[] = [];

    for (const field of fields) {
      const hasCadastral = field.foglio && field.particella;
      let existing: { id: string } | null = null;
      if (hasCadastral) {
        existing = await this.prisma.field.findFirst({
          where: {
            foglio: field.foglio,
            particella: field.particella,
            sezione: field.sezione,
            subalterno: field.subalterno,
            companyId: field.companyId,
          },
          select: { id: true },
        });
      }
      if (!existing) {
        existing = await this.findExistingByShapefileData(field);
      }
      if (!existing) {
        existing = await this.prisma.field.findFirst({
          where: {
            name: field.name,
            companyId: field.companyId,
          },
          select: { id: true },
        });
      }

      let upserted: Field;
      if (existing) {
        upserted = await this.update(existing.id, field);
      } else {
        upserted = await this.create(field);
      }
      results.push(upserted);
    }

    return results;
  }
