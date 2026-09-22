import { ProductionCycle } from '../../../domain/entities/ProductionCycle';
import { IProductionCycleRepository } from '../../../domain/repositories/IProductionCycleRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface UpdateProductionCycleDTO {
  cycleId: string;
  data: Partial<{
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
  }>;
}

export class UpdateProductionCycleUseCase {
  constructor(
    private readonly cycleRepository: IProductionCycleRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async execute(dto: UpdateProductionCycleDTO): Promise<{ cycle: ProductionCycle }> {
    const existingCycle = await this.cycleRepository.findById(dto.cycleId);
    if (!existingCycle) {
      throw AppError.notFound('ProductionCycle not found', 'PRODUCTION_CYCLE_NOT_FOUND');
    }

    const productionUnit = await this.productionUnitRepository.findById(
      existingCycle.productionUnitId,
    );
    if (!productionUnit) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }

    // Validate dates if provided
    const floweringDate = dto.data.floweringDate
      ? new Date(dto.data.floweringDate)
      : existingCycle.floweringDate;
    const harvestingDate = dto.data.harvestingDate
      ? new Date(dto.data.harvestingDate)
      : existingCycle.harvestingDate;

    if (
      floweringDate &&
      harvestingDate &&
      productionUnit.startDate &&
      productionUnit.endDate &&
      (floweringDate < productionUnit.startDate || harvestingDate > productionUnit.endDate)
    ) {
      throw AppError.badRequest(
        `Cycle dates must be within ProductionUnit range (${productionUnit.startDate.toISOString()} - ${productionUnit.endDate.toISOString()})`,
        'CYCLE_DATES_OUT_OF_RANGE',
      );
    }

    if (floweringDate && harvestingDate && floweringDate >= harvestingDate) {
      throw AppError.badRequest(
        'Flowering date must be before harvesting date',
        'INVALID_CYCLE_DATES',
      );
    }

    const updated = await this.cycleRepository.update(dto.cycleId, {
      ...dto.data,
      floweringDate,
      harvestingDate,
    });

    return { cycle: updated };
  }
}
