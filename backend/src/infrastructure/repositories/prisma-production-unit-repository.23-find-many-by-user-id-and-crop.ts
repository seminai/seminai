import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { createPlaceholderCycle } from './production-unit-placeholder-cycle';
import type { PrismaProductionUnitRepositoryContext } from './prisma-production-unit-repository.context';

export async function prismaProductionUnitRepositoryFindManyByUserIdAndCrop(this: PrismaProductionUnitRepositoryContext, userId: string, cropName: string): Promise<
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
        createPlaceholderCycle(result.productionUnit);
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
