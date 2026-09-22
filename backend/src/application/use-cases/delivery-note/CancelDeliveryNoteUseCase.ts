import {
  DeliveryNoteWithItems,
  IDeliveryNoteRepository,
} from '../../../domain/repositories/IDeliveryNoteRepository';
import { CancelDeliveryNoteDTO } from '../../../domain/dtos/delivery-note.dto';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Cancels a DDT and restores the warehouse via compensating IN movements
 * (storno/rientro). Delegates the atomic reversal to the repository transaction.
 */
export class CancelDeliveryNoteUseCase {
  constructor(private readonly deliveryNoteRepository: IDeliveryNoteRepository) {}

  async execute(data: CancelDeliveryNoteDTO): Promise<DeliveryNoteWithItems> {
    const existing = await this.deliveryNoteRepository.findById(data.deliveryNoteId);
    if (!existing) {
      throw AppError.notFound('DDT not found', 'DDT_NOT_FOUND');
    }
    return this.deliveryNoteRepository.cancel({
      deliveryNoteId: data.deliveryNoteId,
      reason: data.reason ?? null,
    });
  }
}
