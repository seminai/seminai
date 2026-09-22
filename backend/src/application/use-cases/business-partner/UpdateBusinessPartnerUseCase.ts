import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { AppError } from '../../../domain/errors/AppError';

/** Updates an existing customer/supplier. */
export class UpdateBusinessPartnerUseCase {
  constructor(private readonly partnerRepository: IBusinessPartnerRepository) {}

  async execute(params: { id: string; data: Partial<BusinessPartner> }): Promise<BusinessPartner> {
    const existing = await this.partnerRepository.findById(params.id);
    if (!existing) {
      throw AppError.notFound('Business partner not found', 'PARTNER_NOT_FOUND');
    }
    return this.partnerRepository.update(params.id, params.data);
  }
}
