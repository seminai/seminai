import { Prisma, PrismaClient } from '@prisma/client';
import { Field } from '../../domain/entities/Field';
import { IFieldRepository } from '../../domain/repositories/IFieldRepository';

export class PrismaFieldRepository implements IFieldRepository {
  constructor(private readonly prisma: PrismaClient) {}
  private areNumbersClose(a: number, b: number, tolerance: number): boolean {
    return Math.abs(a - b) <= tolerance;
  }

  private areCoordinatesClose(
    a: readonly number[],
    b: readonly number[],
    tolerance: number,
  ): boolean {
    if (a.length < 2 || b.length < 2) return false;
    return (
      this.areNumbersClose(a[0], b[0], tolerance) && this.areNumbersClose(a[1], b[1], tolerance)
    );
  }

  private async findExistingByShapefileData(field: Field): Promise<{ id: string } | null> {
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

  async create(field: Field): Promise<Field> {
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

  async createMany(fields: Field[]): Promise<void> {
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

  async findById(id: string): Promise<Field | null> {
    const found = await this.prisma.field.findUnique({
      where: { id },
      include: {
        productionUnitsOnFields: {
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: [
                    { seasonYear: 'desc' },
                    { cycleIndex: 'desc' },
                    { harvestingDate: 'desc' },
                  ],
                  take: 1,
                },
              },
            },
          },
        },
        company: { select: { name: true } },
        sourceFile: true,
      },
    });
    if (!found) return null;
    return Field.fromPrismaWithRelations(found);
  }

  async findManyByCompanyId(companyId: string): Promise<Field[]> {
    const list = await this.prisma.field.findMany({
      where: { companyId },
      include: {
        productionUnitsOnFields: {
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: [
                    { seasonYear: 'desc' },
                    { cycleIndex: 'desc' },
                    { harvestingDate: 'desc' },
                  ],
                  take: 1,
                },
              },
            },
          },
        },
        company: { select: { name: true } },
        sourceFile: true,
      },
    });
    return list.map(Field.fromPrismaWithRelations);
  }

  async findManyByUserId(userId: string): Promise<Field[]> {
    const userCompanies = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = userCompanies.map((uc) => uc.companyId);
    if (companyIds.length === 0) return [];

    const list = await this.prisma.field.findMany({
      where: { companyId: { in: companyIds } },
      include: {
        productionUnitsOnFields: {
          include: {
            productionUnit: {
              include: {
                cycles: {
                  orderBy: [
                    { seasonYear: 'desc' },
                    { cycleIndex: 'desc' },
                    { harvestingDate: 'desc' },
                  ],
                  take: 1,
                },
              },
            },
          },
        },
        company: { select: { name: true } },
        sourceFile: true,
      },
    });
    return list.map(Field.fromPrismaWithRelations);
  }

  async findByCadastralReference(params: {
    companyId: string;
    sezione?: string | null;
    foglio: string;
    particella: string;
    subalterno?: string | null;
  }): Promise<Field | null> {
    const { companyId, sezione, foglio, particella, subalterno } = params;
    const found = await this.prisma.field.findFirst({
      where: {
        companyId,
        foglio,
        particella,
        sezione: sezione ?? undefined,
        subalterno: subalterno ?? undefined,
      },
    });
    return found ? Field.fromPrisma(found) : null;
  }

  async update(id: string, data: Partial<Field>): Promise<Field> {
    const prismaData: Prisma.FieldUpdateInput = {};
    if (typeof data.name !== 'undefined') prismaData.name = data.name;
    if (typeof data.coordinates !== 'undefined')
      prismaData.coordinates = data.coordinates as number[];
    if (typeof data.latitude !== 'undefined') prismaData.latitude = data.latitude as number | null;
    if (typeof data.longitude !== 'undefined')
      prismaData.longitude = data.longitude as number | null;
    if (typeof data.polygon !== 'undefined')
      prismaData.polygon =
        data.polygon === null ? Prisma.JsonNull : (data.polygon as Prisma.InputJsonValue);
    if (typeof data.gisHa !== 'undefined') prismaData.gisHa = data.gisHa as number | null;
    if (typeof data.sauHa !== 'undefined') prismaData.sauHa = data.sauHa as number | null;
    if (typeof data.ph !== 'undefined') prismaData.ph = data.ph as number | null;
    if (typeof data.nitrogen !== 'undefined') prismaData.nitrogen = data.nitrogen as number | null;
    if (typeof data.phosphorus !== 'undefined')
      prismaData.phosphorus = data.phosphorus as number | null;
    if (typeof data.potassium !== 'undefined')
      prismaData.potassium = data.potassium as number | null;
    if (typeof data.calcium !== 'undefined') prismaData.calcium = data.calcium as number | null;
    if (typeof data.magnesium !== 'undefined')
      prismaData.magnesium = data.magnesium as number | null;
    if (typeof data.soilType !== 'undefined') prismaData.soilType = data.soilType as string | null;
    if (typeof data.uso !== 'undefined') prismaData.uso = data.uso as string | null;
    if (typeof data.qualita !== 'undefined') prismaData.qualita = data.qualita as string | null;
    if (typeof data.superficieCatastaleMq !== 'undefined')
      prismaData.superficieCatastaleMq = data.superficieCatastaleMq as number | null;
    if (typeof data.sezione !== 'undefined') prismaData.sezione = data.sezione as string | null;
    if (typeof data.foglio !== 'undefined') prismaData.foglio = data.foglio as string | null;
    if (typeof data.particella !== 'undefined')
      prismaData.particella = data.particella as string | null;
    if (typeof data.subalterno !== 'undefined')
      prismaData.subalterno = data.subalterno as string | null;
    if (typeof data.nation !== 'undefined') prismaData.nation = data.nation as string | null;
    if (typeof data.region !== 'undefined') prismaData.region = data.region as string | null;
    if (typeof data.city !== 'undefined') prismaData.city = data.city as string | null;
    if (typeof data.address !== 'undefined') prismaData.address = data.address as string | null;
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
        data.sourceFileId === null ? { disconnect: true } : { connect: { id: data.sourceFileId } };
    }

    const updated = await this.prisma.field.update({ where: { id }, data: prismaData });
    return Field.fromPrisma(updated);
  }

  async updateMany(updates: Array<{ id: string; data: Partial<Field> }>): Promise<number> {
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

  async upsertMany(fields: Field[]): Promise<Field[]> {
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

  async delete(id: string): Promise<void> {
    await this.prisma.field.delete({ where: { id } });
  }

  /**
   * Delete multiple fields by their IDs.
   * Also deletes related productionUnitOnField records in a transaction.
   * @param ids - Array of field IDs to delete
   */
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.productionUnitOnField.deleteMany({
        where: {
          fieldId: { in: ids },
        },
      });
      await tx.field.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    });
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    const fields = await this.prisma.field.findMany({
      where: { companyId },
      select: { id: true },
    });
    const ids = fields.map((f) => f.id);
    if (ids.length === 0) return 0;
    await this.deleteMany(ids);
    return ids.length;
  }

  async clearSourceFileIds(fileIds: readonly string[]): Promise<number> {
    if (fileIds.length === 0) return 0;
    const result = await this.prisma.field.updateMany({
      where: { sourceFileId: { in: [...fileIds] } },
      data: { sourceFileId: null },
    });
    return result.count;
  }
}
