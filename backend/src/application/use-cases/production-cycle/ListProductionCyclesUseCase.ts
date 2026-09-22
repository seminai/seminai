import { ProductionCycle } from '../../../domain/entities/ProductionCycle';
import { IProductionCycleRepository } from '../../../domain/repositories/IProductionCycleRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface ListProductionCyclesDTO {
  productionUnitId: string;
}

export interface ProductionCycleWithStatus extends ProductionCycle {
  status: 'past' | 'current' | 'future';
}

export class ListProductionCyclesUseCase {
  constructor(
    private readonly cycleRepository: IProductionCycleRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async execute(data: ListProductionCyclesDTO): Promise<{
    cycles: ProductionCycleWithStatus[];
    productionUnitId: string;
    productionUnitName: string;
  }> {
    const productionUnit = await this.productionUnitRepository.findById(data.productionUnitId);
    if (!productionUnit) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }

    const cycles = await this.cycleRepository.findManyByProductionUnitId(data.productionUnitId);

    const cyclesWithStatus: ProductionCycleWithStatus[] = cycles.map((cycle) => {
      let status: 'past' | 'current' | 'future';
      if (cycle.isPast()) {
        status = 'past';
      } else if (cycle.isCurrent()) {
        status = 'current';
      } else {
        status = 'future';
      }
      return Object.assign(cycle, { status });
    });

    return {
      cycles: cyclesWithStatus,
      productionUnitId: productionUnit.id,
      productionUnitName: productionUnit.name,
    };
  }
}
