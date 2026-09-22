import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { AppError } from '../../../domain/errors/AppError';

export class DeleteProductionUnitUseCase {
  constructor(private readonly productionUnitRepository: IProductionUnitRepository) {}

  async execute(id: string): Promise<void> {
    const existing = await this.productionUnitRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }
    await this.productionUnitRepository.delete(id);
  }
}
