import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { AppError } from '../../../domain/errors/AppError';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { validateProductionUnitAllocations } from './validateProductionUnitAllocations';

export interface CreateProductionUnitBulkDTO {
  productionUnits: Array<{
    name: string;
    cropName: string;
    cropType: string;
    variety: string;
    protocoll: string;
    areaHa?: number;
    allocations: Array<{ fieldId: string; areaHa: number }>;
    protectionStructure: string;
    startDate: Date | null;
    floweringDate: Date | null;
    harvestingDate: Date | null;
    endDate: Date | null;
    occupazione?: string | null;
    destinazioneDiUso?: string | null;
    acquaTotalePeridoL?: number | null;
  }>;
}

export class CreateProductionUnitsBulkUseCase {
  constructor(
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
  ) {}

  async execute({ productionUnits }: CreateProductionUnitBulkDTO): Promise<{
    productionUnits: ProductionUnit[];
    count: number;
  }> {
    if (!Array.isArray(productionUnits) || productionUnits.length === 0) {
      throw AppError.badRequest('Missing productionUnits array', 'MISSING_PRODUCTION_UNITS');
    }

    const invalidIndex = productionUnits.findIndex(
      (pu) => !pu.name || !pu.cropName || !pu.allocations?.length,
    );
    if (invalidIndex !== -1) {
      throw AppError.badRequest(
        `Missing required fields in productionUnits[${invalidIndex}] (name, cropName, allocations required)`,
        'MISSING_REQUIRED_FIELDS',
      );
    }

    for (let index = 0; index < productionUnits.length; index += 1) {
      await validateProductionUnitAllocations(
        productionUnits[index].allocations,
        this.fieldRepository,
        `productionUnits[${index}]`,
      );
    }

    const productionUnitsToCreate = productionUnits.map((pu) => {
      const areaHa = pu.areaHa ?? pu.allocations.reduce((sum, a) => sum + a.areaHa, 0);
      const acquaTotalePeridoL = pu.acquaTotalePeridoL ?? 0;

      return {
        productionUnit: ProductionUnit.create({
          name: pu.name,
          cropName: pu.cropName,
          cropType: pu.cropType,
          variety: pu.variety,
          protocoll: pu.protocoll,
          areaHa,
          protectionStructure: pu.protectionStructure,
          startDate: pu.startDate,
          floweringDate: pu.floweringDate,
          harvestingDate: pu.harvestingDate,
          endDate: pu.endDate,
          occupazione: pu.occupazione,
          destinazioneDiUso: pu.destinazioneDiUso,
          acquaTotalePeridoL,
        }),
        allocations: pu.allocations.map((a) => ({
          fieldId: a.fieldId.trim(),
          areaHaOnField: a.areaHa,
        })),
      };
    });

    const created = await this.productionUnitRepository.createBulk(productionUnitsToCreate);

    return {
      productionUnits: created,
      count: created.length,
    };
  }
}
