import {
  CreateLabelHistoryInput,
  LabelHistoryRecord,
  LabelHistoryWithUser,
} from '../dtos/label-history.dto';

export interface ILabelHistoryRepository {
  create(input: CreateLabelHistoryInput): Promise<LabelHistoryRecord>;

  findById(id: string): Promise<LabelHistoryRecord | null>;

  findByLabelExtractionId(labelExtractionId: string): Promise<ReadonlyArray<LabelHistoryWithUser>>;
}
