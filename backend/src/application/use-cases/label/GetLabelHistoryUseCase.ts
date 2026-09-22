import { LabelHistoryWithUser } from '../../../domain/dtos/label-history.dto';
import { ILabelHistoryRepository } from '../../../domain/repositories/ILabelHistoryRepository';

export interface GetLabelHistoryInput {
  labelExtractionId: string;
}

export class GetLabelHistoryUseCase {
  constructor(private readonly historyRepository: ILabelHistoryRepository) {}

  async execute(input: GetLabelHistoryInput): Promise<ReadonlyArray<LabelHistoryWithUser>> {
    return this.historyRepository.findByLabelExtractionId(input.labelExtractionId);
  }
}
