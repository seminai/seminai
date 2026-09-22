import {
  DeliveryNoteWithItems,
  IDeliveryNoteRepository,
} from '../../../domain/repositories/IDeliveryNoteRepository';

/**
 * Marks a GENERATED DDT as SENT (handed to the courier). The repository transaction
 * validates the state transition (idempotent: throws if already SENT).
 */
export class MarkSentDeliveryNoteUseCase {
  constructor(private readonly deliveryNoteRepository: IDeliveryNoteRepository) {}

  async execute(deliveryNoteId: string): Promise<DeliveryNoteWithItems> {
    return this.deliveryNoteRepository.markSent(deliveryNoteId);
  }
}
