import { Prisma } from '@prisma/client';
import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryCreateMany(this: PrismaFieldRepositoryContext, fields: Field[]): Promise<void> {
    if (fields.length === 0) return;
    await this.prisma.field.createMany({
      data: fields.map((f) => ({
        id: f.id,
        companyId: f.companyId ?? undefined,
        sourceFileId: f.sourceFileId ?? undefined,
        name: f.name,
        coordinates: f.coordinates,
        latitude: f.latitude ?? undefined,
        longitude: f.longitude ?? undefined,
        polygon: (f.polygon ?? undefined) as Prisma.InputJsonValue | undefined,
        gisHa: f.gisHa ?? undefined,
        sauHa: f.sauHa ?? undefined,
        ph: f.ph ?? undefined,
        nitrogen: f.nitrogen ?? undefined,
        phosphorus: f.phosphorus ?? undefined,
        potassium: f.potassium ?? undefined,
        calcium: f.calcium ?? undefined,
        magnesium: f.magnesium ?? undefined,
        soilType: f.soilType ?? undefined,
        uso: f.uso ?? undefined,
        qualita: f.qualita ?? undefined,
        superficieCatastaleMq: f.superficieCatastaleMq,
        sezione: f.sezione,
        foglio: f.foglio,
        particella: f.particella,
        subalterno: f.subalterno ?? undefined,
        nation: f.nation ?? undefined,
        region: f.region ?? undefined,
        city: f.city ?? undefined,
        address: f.address,
        cap: f.cap ?? undefined,
        variazioneMq: f.variazioneMq ?? undefined,
        inizioConduzione: f.inizioConduzione ?? undefined,
        fineConduzione: f.fineConduzione ?? undefined,
        bufferZoneNotes: f.bufferZoneNotes ?? undefined,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    });
  }
