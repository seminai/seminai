import {
  DeliveryNoteWithItems,
  IDeliveryNoteRepository,
} from '../../../domain/repositories/IDeliveryNoteRepository';
import { AppError } from '../../../domain/errors/AppError';

/** Fetches a DDT with its lines. */
export class GetDeliveryNoteUseCase {
  constructor(private readonly deliveryNoteRepository: IDeliveryNoteRepository) {}

  async execute(id: string): Promise<DeliveryNoteWithItems> {
    const found = await this.deliveryNoteRepository.findById(id);
    if (!found) {
      throw AppError.notFound('DDT not found', 'DDT_NOT_FOUND');
    }
    return found;
  }
}
