import { ProductionCycle } from '../../../domain/entities/ProductionCycle';
import { IProductionCycleRepository } from '../../../domain/repositories/IProductionCycleRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface CreateProductionCycleDTO {
  productionUnitId: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  protectionStructure: string;
  floweringDate: Date;
  harvestingDate: Date;
  occupazione?: string | null;
  destinazioneDiUso?: string | null;
  acquaTotalePeridoL: number;
  seasonYear?: number;
  cycleIndex?: number;
}

export class CreateProductionCycleUseCase {
  constructor(
    private readonly cycleRepository: IProductionCycleRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async execute(data: CreateProductionCycleDTO): Promise<{ cycle: ProductionCycle }> {
    const productionUnit = await this.productionUnitRepository.findById(data.productionUnitId);
    if (!productionUnit) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }

    // Validate dates are within production unit range
    const floweringDate = new Date(data.floweringDate);
    const harvestingDate = new Date(data.harvestingDate);

    if (
      productionUnit.startDate &&
      productionUnit.endDate &&
      (floweringDate < productionUnit.startDate || harvestingDate > productionUnit.endDate)
    ) {
      throw AppError.badRequest(
        `Cycle dates must be within ProductionUnit range (${productionUnit.startDate.toISOString()} - ${productionUnit.endDate.toISOString()})`,
        'CYCLE_DATES_OUT_OF_RANGE',
      );
    }

    if (floweringDate >= harvestingDate) {
      throw AppError.badRequest(
        'Flowering date must be before harvesting date',
        'INVALID_CYCLE_DATES',
      );
    }

    // Determine season year and cycle index
    const seasonYear = data.seasonYear ?? floweringDate.getUTCFullYear();
    const cycleIndex =
      data.cycleIndex ??
      (await this.cycleRepository.getNextCycleIndex(data.productionUnitId, seasonYear));

    const cycle = ProductionCycle.create({
      productionUnitId: data.productionUnitId,
      cropName: data.cropName,
      cropType: data.cropType,
      variety: data.variety,
      protocoll: data.protocoll,
      protectionStructure: data.protectionStructure,
      floweringDate,
      harvestingDate,
      occupazione: data.occupazione,
      destinazioneDiUso: data.destinazioneDiUso,
      acquaTotalePeridoL: data.acquaTotalePeridoL,
      seasonYear,
      cycleIndex,
    });

    const created = await this.cycleRepository.create(cycle);
    return { cycle: created };
  }
}
