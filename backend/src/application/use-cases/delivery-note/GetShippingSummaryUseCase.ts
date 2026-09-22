import { DeliveryNoteStatus } from '@prisma/client';
import { IDeliveryNoteRepository } from '../../../domain/repositories/IDeliveryNoteRepository';
import { ShippingSummaryDto } from '../../../domain/dtos/shipping-summary.dto';
import { aggregateShippingSummary } from './aggregate-shipping-summary';

/** Read-only aggregation of the company's pending (GENERATED) DDTs by date + carrier. */
export class GetShippingSummaryUseCase {
  constructor(private readonly deliveryNoteRepository: IDeliveryNoteRepository) {}

  async execute(companyId: string): Promise<ShippingSummaryDto> {
    const entries = await this.deliveryNoteRepository.findManyByCompany(companyId, {
      status: DeliveryNoteStatus.GENERATED,
    });
    return aggregateShippingSummary(entries.map((entry) => entry.deliveryNote));
  }
}
