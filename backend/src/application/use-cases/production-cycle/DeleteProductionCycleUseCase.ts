import { IProductionCycleRepository } from '../../../domain/repositories/IProductionCycleRepository';
import { AppError } from '../../../domain/errors/AppError';

export class DeleteProductionCycleUseCase {
  constructor(private readonly cycleRepository: IProductionCycleRepository) {}

  async execute(cycleId: string): Promise<void> {
    const existingCycle = await this.cycleRepository.findById(cycleId);
    if (!existingCycle) {
      throw AppError.notFound('ProductionCycle not found', 'PRODUCTION_CYCLE_NOT_FOUND');
    }

    // Check if this is the last cycle - don't allow deletion
    const cycleCount = await this.cycleRepository.countByProductionUnitId(
      existingCycle.productionUnitId,
    );
    if (cycleCount <= 1) {
      throw AppError.badRequest(
        'Cannot delete the last cycle of a ProductionUnit. Delete the ProductionUnit instead.',
        'CANNOT_DELETE_LAST_CYCLE',
      );
    }

    await this.cycleRepository.delete(cycleId);
  }
}
