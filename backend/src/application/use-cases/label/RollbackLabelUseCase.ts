import {
  ILabelExtractionRepository,
  LabelExtractionRecord,
  SavedLabelExtraction,
} from '../../../domain/repositories/ILabelExtractionRepository';
import { ILabelHistoryRepository } from '../../../domain/repositories/ILabelHistoryRepository';
import { calculateLabelChanges, createLabelSnapshot } from '../../../domain/utils/labelDiff';

export interface RollbackLabelInput {
  historyEntryId: string;
  userId: string;
}

export class RollbackLabelUseCase {
  constructor(
    private readonly labelRepository: ILabelExtractionRepository,
    private readonly historyRepository: ILabelHistoryRepository,
  ) {}

  async execute(input: RollbackLabelInput): Promise<LabelExtractionRecord | null> {
    const historyEntry = await this.historyRepository.findById(input.historyEntryId);
    if (!historyEntry) return null;

    const currentLabel = await this.labelRepository.findById(historyEntry.labelExtractionId);
    if (!currentLabel) return null;

    const snapshot = historyEntry.previousSnapshot as Partial<SavedLabelExtraction>;

    // Record the rollback itself as a new history entry
    const rollbackChanges = calculateLabelChanges(currentLabel, snapshot);
    if (rollbackChanges.length > 0) {
      const currentSnapshot = createLabelSnapshot(currentLabel);
      await this.historyRepository.create({
        labelExtractionId: historyEntry.labelExtractionId,
        userId: input.userId,
        changes: rollbackChanges,
        previousSnapshot: currentSnapshot,
      });
    }

    const restored = await this.labelRepository.updateById(
      historyEntry.labelExtractionId,
      snapshot,
    );

    return restored;
  }
}
