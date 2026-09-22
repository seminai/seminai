import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import {
  IProductionUnitRepository,
  type ProductionUnitCycleCreateInput,
} from '../../domain/repositories/IProductionUnitRepository';

export class PrismaProductionUnitRepository implements IProductionUnitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private toDate(value: string | Date | null | undefined): Date | undefined {
    if (value === null || typeof value === 'undefined') return undefined;
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

  private toDateNullable(value: string | Date | null | undefined): Date | null | undefined {
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

  /** Cycle row for list APIs when a PU has no ProductionCycle yet (still linked to fields). */
  private static placeholderCycle(pu: { createdAt: Date; updatedAt: Date }): {
    id: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    protectionStructure: string;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    occupazione: string | null;
    destinazioneDiUso: string | null;
    acquaTotalePeridoL: number;
    seasonYear: number;
    cycleIndex: number;
    createdAt: Date;
    updatedAt: Date;
  } {
    return {
      id: randomUUID(),
      cropName: '',
      cropType: '',
      variety: '',
      protocoll: '',
      protectionStructure: '',
      floweringDate: null,
      harvestingDate: null,
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
      seasonYear: new Date().getUTCFullYear(),
      cycleIndex: 1,
      createdAt: pu.createdAt,
      updatedAt: pu.updatedAt,
    };
  }

  async create(
    pu: ProductionUnit,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<ProductionUnit> {
    return this.createWithCycles(pu, allocations, []);
  }

  private async createWithCycles(
    pu: ProductionUnit,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
    additionalCycles: readonly ProductionUnitCycleCreateInput[],
  ): Promise<ProductionUnit> {
    const created = await this.prisma.productionUnit.create({
      data: {
        id: pu.id,
        name: pu.name,
        startDate: pu.startDate ?? new Date(),
        endDate: pu.endDate ?? new Date(),
        areaHa: pu.areaHa,
        createdAt: pu.createdAt,
        updatedAt: pu.updatedAt,
        productionUnitsOnFields: {
          create: allocations.map((a) => ({ fieldId: a.fieldId, areaHaOnField: a.areaHaOnField })),
        },
      },
    });
    const cycles = await this.createCyclesForUnit(created.id, pu, additionalCycles);
    return ProductionUnit.fromPrisma({ productionUnit: created, productionCycle: cycles[0] });
  }

  async createMany(pus: ProductionUnit[]): Promise<void> {
    if (pus.length === 0) return;
    for (const p of pus) {
      await this.create(p, []);
    }
  }

  async createBulk(
    productionUnits: Array<{
      productionUnit: ProductionUnit;
      allocations: Array<{ fieldId: string; areaHaOnField: number }>;
      additionalCycles?: readonly ProductionUnitCycleCreateInput[];
    }>,
  ): Promise<ProductionUnit[]> {
    const created: ProductionUnit[] = [];

    for (const { productionUnit, allocations, additionalCycles } of productionUnits) {
      const puEntity = await this.createWithCycles(
        productionUnit,
        allocations,
        additionalCycles ?? [],
      );
      created.push(puEntity);
    }

    return created;
  }

  private async createCyclesForUnit(
    productionUnitId: string,
    pu: ProductionUnit,
    additionalCycles: readonly ProductionUnitCycleCreateInput[],
  ) {
    const primary = {
      id: pu.cycleId,
      productionUnitId,
      cropName: pu.cropName,
      cropType: pu.cropType,
      variety: pu.variety,
      protocoll: pu.protocoll,
      protectionStructure: pu.protectionStructure,
      floweringDate: pu.floweringDate,
      harvestingDate: pu.harvestingDate,
      occupazione: pu.occupazione,
      destinazioneDiUso: pu.destinazioneDiUso,
      acquaTotalePeridoL: pu.acquaTotalePeridoL,
      seasonYear: pu.seasonYear,
      cycleIndex: pu.cycleIndex,
      createdAt: pu.createdAt,
      updatedAt: pu.updatedAt,
    };
    const extra = additionalCycles
      .filter((cycle) => cycle.cycleIndex !== pu.cycleIndex)
      .map((cycle) => ({
        id: randomUUID(),
        productionUnitId,
        cropName: cycle.cropName,
        cropType: cycle.cropType,
        variety: cycle.variety,
        protocoll: cycle.protocoll,
        protectionStructure: cycle.protectionStructure,
        floweringDate: cycle.floweringDate,
        harvestingDate: cycle.harvestingDate,
        occupazione: cycle.occupazione ?? null,
        destinazioneDiUso: cycle.destinazioneDiUso ?? null,
        acquaTotalePeridoL: cycle.acquaTotalePeridoL,
        seasonYear: cycle.seasonYear,
        cycleIndex: cycle.cycleIndex,
        createdAt: pu.createdAt,
        updatedAt: pu.updatedAt,
      }));
    await this.prisma.productionCycle.createMany({ data: [primary, ...extra] });
    return this.prisma.productionCycle.findMany({
      where: { productionUnitId },
      orderBy: [{ cycleIndex: 'asc' }],
    });
  }

  async findById(id: string): Promise<ProductionUnit | null> {
    const found = await this.prisma.productionUnit.findUnique({
      where: { id },
      include: {
        cycles: {
          orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
          take: 1,
        },
      },
    });
    if (!found || found.cycles.length === 0) return null;
    const cycle = found.cycles[0];
    return ProductionUnit.fromPrisma({ productionUnit: found, productionCycle: cycle });
  }

  async findManyByFieldId(fieldId: string): Promise<ProductionUnit[]> {
    const list = await this.prisma.productionUnit.findMany({
      where: { productionUnitsOnFields: { some: { fieldId } } },
      include: {
        cycles: {
          orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
          take: 1,
        },
      },
    });
    return list
      .filter((pu) => pu.cycles.length > 0)
      .map((pu) =>
        ProductionUnit.fromPrisma({ productionUnit: pu, productionCycle: pu.cycles[0] }),
      );
  }

  async sumAreaByFieldAndOverlappingRange(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<number> {
    const overlapping = await this.prisma.productionUnitOnField.findMany({
      where: {
        fieldId,
        productionUnit: {
          AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
        },
      },
      select: { areaHaOnField: true },
    });
    return overlapping.reduce((sum, r) => sum + r.areaHaOnField, 0);
  }

  async findOverlappingByField(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<
    Array<{
      productionUnitId: string;
      productionUnitName: string;
      cropName: string | null;
      startDate: Date;
      endDate: Date;
      areaHaOnField: number;
    }>
  > {
    const overlapping = await this.prisma.productionUnitOnField.findMany({
      where: {
        fieldId,
        productionUnit: {
          AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
        },
      },
      select: {
        areaHaOnField: true,
        productionUnit: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            cycles: {
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
              select: { cropName: true },
            },
          },
        },
      },
    });
    return overlapping.map((row) => ({
      productionUnitId: row.productionUnit.id,
      productionUnitName: row.productionUnit.name,
      cropName: row.productionUnit.cycles[0]?.cropName ?? null,
      startDate: row.productionUnit.startDate,
      endDate: row.productionUnit.endDate,
      areaHaOnField: row.areaHaOnField,
    }));
  }

  async getOverlappingDateWindow(
    fieldId: string,
    range: { startDate: Date; endDate: Date },
  ): Promise<{ earliestStart: Date | null; latestEnd: Date | null }> {
    const overlaps = await this.prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: { some: { fieldId } },
        AND: [{ startDate: { lte: range.endDate } }, { endDate: { gte: range.startDate } }],
      },
      select: { startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    if (overlaps.length === 0) return { earliestStart: null, latestEnd: null };
    const earliestStart = overlaps[0].startDate;
    const latestEnd = overlaps.reduce(
      (max, r) => (r.endDate > max ? r.endDate : max),
      overlaps[0].endDate,
    );
    return { earliestStart, latestEnd };
  }

  async update(id: string, data: Partial<ProductionUnit>): Promise<ProductionUnit> {
    const latestCycle = await this.prisma.productionCycle.findFirst({
      where: { productionUnitId: id },
      orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
    });
    if (!latestCycle) {
      throw new Error(`ProductionUnit ${id} has no cycles to update`);
    }
    const prismaUnitData: Prisma.ProductionUnitUpdateInput = {};
    if (typeof data.name !== 'undefined') prismaUnitData.name = data.name;
    if (typeof data.startDate !== 'undefined')
      prismaUnitData.startDate = this.toDate(data.startDate);
    if (typeof data.endDate !== 'undefined') prismaUnitData.endDate = this.toDate(data.endDate);
    if (typeof data.areaHa !== 'undefined') prismaUnitData.areaHa = data.areaHa;

    const prismaCycleData: Prisma.ProductionCycleUpdateInput = {};
    if (typeof data.cropName !== 'undefined') prismaCycleData.cropName = data.cropName as string;
    if (typeof data.cropType !== 'undefined') prismaCycleData.cropType = data.cropType as string;
    if (typeof data.variety !== 'undefined') prismaCycleData.variety = data.variety as string;
    if (typeof data.protocoll !== 'undefined') prismaCycleData.protocoll = data.protocoll as string;
    if (typeof data.protectionStructure !== 'undefined')
      prismaCycleData.protectionStructure = data.protectionStructure as string;
    if (typeof data.floweringDate !== 'undefined')
      prismaCycleData.floweringDate = this.toDateNullable(data.floweringDate);
    if (typeof data.harvestingDate !== 'undefined')
      prismaCycleData.harvestingDate = this.toDateNullable(data.harvestingDate);
    if (typeof data.occupazione !== 'undefined')
      prismaCycleData.occupazione = data.occupazione as string | null;
    if (typeof data.destinazioneDiUso !== 'undefined')
      prismaCycleData.destinazioneDiUso = data.destinazioneDiUso as string | null;
    if (typeof data.acquaTotalePeridoL !== 'undefined')
      prismaCycleData.acquaTotalePeridoL = data.acquaTotalePeridoL as number;
    if (typeof data.seasonYear !== 'undefined') prismaCycleData.seasonYear = data.seasonYear;
    if (typeof data.cycleIndex !== 'undefined') prismaCycleData.cycleIndex = data.cycleIndex;

    const [updatedUnit, updatedCycle] = await this.prisma.$transaction([
      this.prisma.productionUnit.update({ where: { id }, data: prismaUnitData }),
      this.prisma.productionCycle.update({
        where: { id: latestCycle.id },
        data: prismaCycleData,
      }),
    ]);
    return ProductionUnit.fromPrisma({
      productionUnit: updatedUnit,
      productionCycle: updatedCycle,
    });
  }

  async listFieldIdsByProductionUnit(productionUnitId: string): Promise<string[]> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { fieldId: true },
    });
    return links.map((l) => l.fieldId);
  }

  async listCompanyIdsByProductionUnit(productionUnitId: string): Promise<string[]> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { field: { select: { companyId: true } } },
    });
    const companyIds = links
      .map((link) => link.field.companyId)
      .filter((companyId): companyId is string => Boolean(companyId));
    return [...new Set(companyIds)];
  }

  async getAllocationsByProductionUnit(
    productionUnitId: string,
  ): Promise<Array<{ fieldId: string; areaHaOnField: number }>> {
    const links = await this.prisma.productionUnitOnField.findMany({
      where: { productionUnitId },
      select: { fieldId: true, areaHaOnField: true },
    });
    return links.map((l) => ({ fieldId: l.fieldId, areaHaOnField: l.areaHaOnField }));
  }

  async replaceAllocations(
    productionUnitId: string,
    allocations: Array<{ fieldId: string; areaHaOnField: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productionUnitOnField.deleteMany({ where: { productionUnitId } });
      if (allocations.length > 0) {
        await tx.productionUnitOnField.createMany({
          data: allocations.map((a) => ({
            id: randomUUID(),
            productionUnitId,
            fieldId: a.fieldId,
            areaHaOnField: a.areaHaOnField,
          })),
        });
      }
    });
  }

  async updateMany(updates: Array<{ id: string; data: Partial<ProductionUnit> }>): Promise<number> {
    let count = 0;
    for (const { id, data } of updates) {
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`ProductionUnit with id ${id} not found`);
      }
      const prismaUnitData: Prisma.ProductionUnitUpdateInput = {};
      if (typeof data.name !== 'undefined') prismaUnitData.name = data.name;
      if (typeof data.startDate !== 'undefined')
        prismaUnitData.startDate = this.toDate(data.startDate);
      if (typeof data.endDate !== 'undefined') prismaUnitData.endDate = this.toDate(data.endDate);
      if (typeof data.areaHa !== 'undefined') prismaUnitData.areaHa = data.areaHa;

      const prismaCycleData: Prisma.ProductionCycleUpdateInput = {};
      if (typeof data.cropName !== 'undefined') prismaCycleData.cropName = data.cropName as string;
      if (typeof data.cropType !== 'undefined') prismaCycleData.cropType = data.cropType as string;
      if (typeof data.variety !== 'undefined') prismaCycleData.variety = data.variety as string;
      if (typeof data.protocoll !== 'undefined')
        prismaCycleData.protocoll = data.protocoll as string;
      if (typeof data.protectionStructure !== 'undefined')
        prismaCycleData.protectionStructure = data.protectionStructure as string;
      if (typeof data.floweringDate !== 'undefined')
        prismaCycleData.floweringDate = this.toDateNullable(data.floweringDate);
      if (typeof data.harvestingDate !== 'undefined')
        prismaCycleData.harvestingDate = this.toDateNullable(data.harvestingDate);
      if (typeof data.occupazione !== 'undefined')
        prismaCycleData.occupazione = data.occupazione as string | null;
      if (typeof data.destinazioneDiUso !== 'undefined')
        prismaCycleData.destinazioneDiUso = data.destinazioneDiUso as string | null;
      if (typeof data.acquaTotalePeridoL !== 'undefined')
        prismaCycleData.acquaTotalePeridoL = data.acquaTotalePeridoL as number;
      if (typeof data.seasonYear !== 'undefined') prismaCycleData.seasonYear = data.seasonYear;
      if (typeof data.cycleIndex !== 'undefined') prismaCycleData.cycleIndex = data.cycleIndex;

      await this.prisma.$transaction([
        this.prisma.productionUnit.update({ where: { id }, data: prismaUnitData }),
        this.prisma.productionCycle.updateMany({
          where: { productionUnitId: id },
          data: prismaCycleData,
        }),
      ]);
      count++;
    }
    return count;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.productionUnit.delete({ where: { id } });
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.job.deleteMany({
        where: {
          productionUnitId: { in: ids },
        },
      });
      await tx.productionUnitOnField.deleteMany({
        where: {
          productionUnitId: { in: ids },
        },
      });
      await tx.productionUnit.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    });
  }

  async deleteAllByCompanyId(companyId: string): Promise<number> {
    const pus = await this.prisma.productionUnit.findMany({
      where: {
        productionUnitsOnFields: { some: { field: { companyId } } },
      },
      select: { id: true },
    });
    const ids = pus.map((pu) => pu.id);
    if (ids.length === 0) return 0;
    await this.deleteMany(ids);
    return ids.length;
  }

  async findManyByUserId(userId: string): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  > {
    const results = await this.prisma.productionUnitOnField.findMany({
      where: {
        field: {
          company: {
            companyUsers: {
              some: {
                userId,
              },
            },
          },
        },
      },
      include: {
        productionUnit: {
          include: {
            cycles: {
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
            },
          },
        },
        field: {
          include: {
            company: true,
          },
        },
      },
    });
    type ResultWithRelations = (typeof results)[number] & {
      productionUnit: {
        id: string;
        name: string;
        areaHa: number;
        startDate: Date;
        endDate: Date;
        createdAt: Date;
        updatedAt: Date;
        cycles: Array<{
          id: string;
          cropName: string;
          cropType: string;
          variety: string;
          protocoll: string;
          protectionStructure: string;
          floweringDate: Date;
          harvestingDate: Date;
          occupazione: string | null;
          destinazioneDiUso: string | null;
          acquaTotalePeridoL: number;
          seasonYear: number;
          cycleIndex: number;
          createdAt: Date;
          updatedAt: Date;
        }>;
      };
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
        companyId: string | null;
        company: { name: string } | null;
      };
    };
    return (results as ResultWithRelations[]).map((result) => {
      const cycle =
        result.productionUnit.cycles[0] ??
        PrismaProductionUnitRepository.placeholderCycle(result.productionUnit);
      return {
        productionUnit: ProductionUnit.fromPrisma({
          productionUnit: result.productionUnit,
          productionCycle: cycle,
        }),
        companyId: result.field.companyId!,
        companyName: result.field.company!.name,
        field: {
          id: result.field.id,
          name: result.field.name,
          sauHa: result.field.sauHa,
          gisHa: result.field.gisHa,
        },
        areaHaOnField: result.areaHaOnField,
      };
    });
  }

  async findManyByUserIdAndCrop(
    userId: string,
    cropName: string,
  ): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  > {
    const results = await this.prisma.productionUnitOnField.findMany({
      where: {
        field: {
          company: {
            companyUsers: {
              some: {
                userId,
              },
            },
          },
        },
        productionUnit: {
          cycles: {
            some: {
              cropName: {
                equals: cropName,
                mode: 'insensitive',
              },
            },
          },
        },
      },
      include: {
        productionUnit: {
          include: {
            cycles: {
              where: {
                cropName: {
                  equals: cropName,
                  mode: 'insensitive',
                },
              },
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
            },
          },
        },
        field: {
          include: {
            company: true,
          },
        },
      },
    });
    type ResultWithRelations = (typeof results)[number] & {
      productionUnit: {
        id: string;
        name: string;
        areaHa: number;
        startDate: Date;
        endDate: Date;
        createdAt: Date;
        updatedAt: Date;
        cycles: Array<{
          id: string;
          cropName: string;
          cropType: string;
          variety: string;
          protocoll: string;
          protectionStructure: string;
          floweringDate: Date;
          harvestingDate: Date;
          occupazione: string | null;
          destinazioneDiUso: string | null;
          acquaTotalePeridoL: number;
          seasonYear: number;
          cycleIndex: number;
          createdAt: Date;
          updatedAt: Date;
        }>;
      };
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
        companyId: string | null;
        company: { name: string } | null;
      };
    };
    return (results as ResultWithRelations[]).map((result) => {
      const cycle =
        result.productionUnit.cycles[0] ??
        PrismaProductionUnitRepository.placeholderCycle(result.productionUnit);
      return {
        productionUnit: ProductionUnit.fromPrisma({
          productionUnit: result.productionUnit,
          productionCycle: cycle,
        }),
        companyId: result.field.companyId!,
        companyName: result.field.company!.name,
        field: {
          id: result.field.id,
          name: result.field.name,
          sauHa: result.field.sauHa,
          gisHa: result.field.gisHa,
        },
        areaHaOnField: result.areaHaOnField,
      };
    });
  }

  async findManyByUserIdAndCompanyIds(
    userId: string,
    companyIds: string[],
  ): Promise<
    Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
      };
      areaHaOnField: number;
    }>
  > {
    if (companyIds.length === 0) {
      return [];
    }
    const results = await this.prisma.productionUnitOnField.findMany({
      where: {
        field: {
          company: {
            id: { in: companyIds },
            companyUsers: {
              some: {
                userId,
              },
            },
          },
        },
      },
      include: {
        productionUnit: {
          include: {
            cycles: {
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
            },
          },
        },
        field: {
          include: {
            company: true,
          },
        },
      },
    });
    type ResultWithRelations = (typeof results)[number] & {
      productionUnit: {
        id: string;
        name: string;
        areaHa: number;
        startDate: Date;
        endDate: Date;
        createdAt: Date;
        updatedAt: Date;
        cycles: Array<{
          id: string;
          cropName: string;
          cropType: string;
          variety: string;
          protocoll: string;
          protectionStructure: string;
          floweringDate: Date;
          harvestingDate: Date;
          occupazione: string | null;
          destinazioneDiUso: string | null;
          acquaTotalePeridoL: number;
          seasonYear: number;
          cycleIndex: number;
          createdAt: Date;
          updatedAt: Date;
        }>;
      };
      field: {
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
        companyId: string | null;
        company: { name: string } | null;
      };
    };
    return (results as ResultWithRelations[]).map((result) => {
      const cycle =
        result.productionUnit.cycles[0] ??
        PrismaProductionUnitRepository.placeholderCycle(result.productionUnit);
      return {
        productionUnit: ProductionUnit.fromPrisma({
          productionUnit: result.productionUnit,
          productionCycle: cycle,
        }),
        companyId: result.field.companyId!,
        companyName: result.field.company!.name,
        field: {
          id: result.field.id,
          name: result.field.name,
          sauHa: result.field.sauHa,
          gisHa: result.field.gisHa,
        },
        areaHaOnField: result.areaHaOnField,
      };
    });
  }
}
