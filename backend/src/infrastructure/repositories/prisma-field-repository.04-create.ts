import { Prisma } from '@prisma/client';
import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryCreate(this: PrismaFieldRepositoryContext, field: Field): Promise<Field> {
    const created = await this.prisma.field.create({
      data: {
        id: field.id,
        companyId: field.companyId ?? undefined,
        sourceFileId: field.sourceFileId ?? undefined,
        name: field.name,
        coordinates: field.coordinates,
        latitude: field.latitude,
        longitude: field.longitude,
        polygon: field.polygon as Prisma.InputJsonValue | undefined,
        gisHa: field.gisHa,
        sauHa: field.sauHa,
        ph: field.ph,
        nitrogen: field.nitrogen,
        phosphorus: field.phosphorus,
        potassium: field.potassium,
        calcium: field.calcium,
        magnesium: field.magnesium,
        soilType: field.soilType,
        uso: field.uso,
        qualita: field.qualita,
        superficieCatastaleMq: field.superficieCatastaleMq,
        sezione: field.sezione,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        nation: field.nation,
        region: field.region,
        city: field.city,
        address: field.address,
        cap: field.cap,
        variazioneMq: field.variazioneMq,
        inizioConduzione: field.inizioConduzione,
        fineConduzione: field.fineConduzione,
        bufferZoneNotes: field.bufferZoneNotes,
        createdAt: field.createdAt,
        updatedAt: field.updatedAt,
      },
    });
    return Field.fromPrisma(created);
  }
