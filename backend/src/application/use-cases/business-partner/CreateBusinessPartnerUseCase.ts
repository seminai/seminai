import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { UpsertBusinessPartnerDTO } from '../../../domain/dtos/business-partner.dto';
import { AppError } from '../../../domain/errors/AppError';

/** Outcome of partner creation, signalling whether an existing record was reused. */
export interface CreateBusinessPartnerResult {
  readonly partner: BusinessPartner;
  readonly reused: boolean;
}

/**
 * Creates a customer/supplier, deduplicating on P.IVA, email or ragione sociale
 * within the same company and partner type.
 */
export class CreateBusinessPartnerUseCase {
  constructor(private readonly partnerRepository: IBusinessPartnerRepository) {}

  async execute(data: UpsertBusinessPartnerDTO): Promise<CreateBusinessPartnerResult> {
    if (!data.companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    }
    if (!data.name || data.name.trim().length === 0) {
      throw AppError.badRequest('name is required', 'MISSING_NAME');
    }
    const duplicate = await this.partnerRepository.findDuplicate({
      companyId: data.companyId,
      type: data.type,
      vatNumber: data.vatNumber ?? null,
      email: data.email ?? null,
      name: data.name,
    });
    if (duplicate) {
      return { partner: duplicate, reused: true };
    }
    const created = await this.partnerRepository.create(BusinessPartner.create(data));
    return { partner: created, reused: false };
  }
}
