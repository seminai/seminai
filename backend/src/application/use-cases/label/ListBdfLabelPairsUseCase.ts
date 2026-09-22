import {
  BdfLabelDatasetPair,
  IBdfLabelDatasetRepository,
} from '../../../domain/repositories/IBdfLabelDatasetRepository';

export class ListBdfLabelPairsUseCase {
  constructor(private readonly repository: IBdfLabelDatasetRepository) {}

  async execute(): Promise<ReadonlyArray<BdfLabelDatasetPair>> {
    const pairs = await this.repository.listAvailablePairs();
    return pairs.map((pair) => ({
      productName: pair.productName,
      registrationNumber: pair.registrationNumber,
    }));
  }
}
