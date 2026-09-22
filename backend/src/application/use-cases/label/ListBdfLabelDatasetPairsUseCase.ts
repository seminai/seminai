import {
  BdfLabelDatasetPair,
  IBdfLabelDatasetRepository,
} from '../../../domain/repositories/IBdfLabelDatasetRepository';

export class ListBdfLabelDatasetPairsUseCase {
  constructor(private readonly repository: IBdfLabelDatasetRepository) {}

  async execute(): Promise<ReadonlyArray<BdfLabelDatasetPair>> {
    return this.repository.listAvailablePairs();
  }
}
