import { IProductRepository } from '../../../domain/repositories/IProductRepository';

export interface DeleteProductsBulkInput {
  ids: string[];
  companyId: string;
}

export class DeleteProductsBulkUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(input: DeleteProductsBulkInput): Promise<void> {
    await this.productRepository.deleteMany(input.ids, input.companyId);
  }
}
