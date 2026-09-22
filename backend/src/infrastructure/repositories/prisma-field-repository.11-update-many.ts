import { Prisma } from '@prisma/client';
import { Field } from '../../domain/entities/Field';
import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryUpdateMany(this: PrismaFieldRepositoryContext, updates: Array<{ id: string; data: Partial<Field> }>): Promise<number> {
    let count = 0;
    for (const { id, data } of updates) {
      const prismaData: Prisma.FieldUpdateInput = {};
      if (typeof data.name !== 'undefined') prismaData.name = data.name;
      if (typeof data.coordinates !== 'undefined')
        prismaData.coordinates = data.coordinates as number[];
      if (typeof data.latitude !== 'undefined')
        prismaData.latitude = data.latitude as number | null;
      if (typeof data.longitude !== 'undefined')
        prismaData.longitude = data.longitude as number | null;
      if (typeof data.polygon !== 'undefined')
        prismaData.polygon =
          data.polygon === null ? Prisma.JsonNull : (data.polygon as Prisma.InputJsonValue);
      if (typeof data.gisHa !== 'undefined') prismaData.gisHa = data.gisHa as number | null;
      if (typeof data.sauHa !== 'undefined') prismaData.sauHa = data.sauHa as number | null;
      if (typeof data.ph !== 'undefined') prismaData.ph = data.ph as number | null;
      if (typeof data.nitrogen !== 'undefined')
        prismaData.nitrogen = data.nitrogen as number | null;
      if (typeof data.phosphorus !== 'undefined')
        prismaData.phosphorus = data.phosphorus as number | null;
      if (typeof data.potassium !== 'undefined')
        prismaData.potassium = data.potassium as number | null;
      if (typeof data.calcium !== 'undefined') prismaData.calcium = data.calcium as number | null;
      if (typeof data.magnesium !== 'undefined')
        prismaData.magnesium = data.magnesium as number | null;
      if (typeof data.soilType !== 'undefined')
        prismaData.soilType = data.soilType as string | null;
      if (typeof data.uso !== 'undefined') prismaData.uso = data.uso as string | null;
      if (typeof data.qualita !== 'undefined') prismaData.qualita = data.qualita as string | null;
      if (typeof data.superficieCatastaleMq !== 'undefined')
        prismaData.superficieCatastaleMq = data.superficieCatastaleMq as number;
      if (typeof data.sezione !== 'undefined') prismaData.sezione = data.sezione as string;
      if (typeof data.foglio !== 'undefined') prismaData.foglio = data.foglio as string;
      if (typeof data.particella !== 'undefined') prismaData.particella = data.particella as string;
      if (typeof data.subalterno !== 'undefined')
        prismaData.subalterno = data.subalterno as string | null;
      if (typeof data.nation !== 'undefined') prismaData.nation = data.nation as string | null;
      if (typeof data.region !== 'undefined') prismaData.region = data.region as string | null;
      if (typeof data.city !== 'undefined') prismaData.city = data.city as string | null;
      if (typeof data.address !== 'undefined') prismaData.address = data.address as string;
      if (typeof data.cap !== 'undefined') prismaData.cap = data.cap as string | null;
      if (typeof data.variazioneMq !== 'undefined')
        prismaData.variazioneMq = data.variazioneMq as string | null;
      if (typeof data.inizioConduzione !== 'undefined')
        prismaData.inizioConduzione = data.inizioConduzione as Date | null;
      if (typeof data.fineConduzione !== 'undefined')
        prismaData.fineConduzione = data.fineConduzione as Date | null;
      if (typeof data.bufferZoneNotes !== 'undefined')
        prismaData.bufferZoneNotes = data.bufferZoneNotes as string | null;
      if (typeof data.companyId !== 'undefined') {
        if (data.companyId === null) {
          prismaData.company = { disconnect: true };
        } else {
          prismaData.company = { connect: { id: data.companyId } };
        }
      }
      if (typeof data.sourceFileId !== 'undefined') {
        prismaData.sourceFile =
          data.sourceFileId === null
            ? { disconnect: true }
            : { connect: { id: data.sourceFileId } };
      }
      await this.prisma.field.update({ where: { id }, data: prismaData });
      count++;
    }
    return count;
  }
