import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';

export interface DeleteProductionUnitsBulkInput {
  ids: string[];
}

export class DeleteProductionUnitsBulkUseCase {
  constructor(private readonly productionUnitRepository: IProductionUnitRepository) {}

  async execute(input: DeleteProductionUnitsBulkInput): Promise<void> {
    await this.productionUnitRepository.deleteMany(input.ids);
  }
}
