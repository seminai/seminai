import { FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import { Label } from '../../../domain/dtos/label.dto';
import {
  ILabelExtractionRepository,
  LabelExtractionRecord,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelHistoryRepository } from '../../../domain/repositories/ILabelHistoryRepository';
import { calculateLabelChanges, createLabelSnapshot } from '../../../domain/utils/labelDiff';

export interface UpdateLabelInput {
  id: string;
  userId?: string;
  productName?: string;
  registrationNumber?: string;
  sourceUrl?: string;
  label?: Label | FertilizerLabel;
  rawText?: string;
  extractionConfidence?: number;
  extractedFields?: string[];
  errors?: string[];
  qualityExtraction?: number[];
}

export class UpdateLabelUseCase {
  constructor(
    private readonly repository: ILabelExtractionRepository,
    private readonly historyRepository?: ILabelHistoryRepository,
  ) {}

  async execute(input: UpdateLabelInput): Promise<LabelExtractionRecord | null> {
    const { id, userId, ...updateData } = input;

    const existing = await this.repository.findById(id);
    if (!existing) return null;

    const updated = await this.repository.updateById(id, updateData);
    if (!updated) return null;

    if (userId && this.historyRepository) {
      const changes = calculateLabelChanges(existing, updateData);
      if (changes.length > 0) {
        const snapshot = createLabelSnapshot(existing);
        await this.historyRepository.create({
          labelExtractionId: id,
          userId,
          changes,
          previousSnapshot: snapshot,
        });
      }
    }

    return updated;
  }
}
