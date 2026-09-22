import { PartnerType } from '@prisma/client';
import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';

/**
 * Looks up customers/suppliers for a company. With a query string it performs a
 * free-text search; otherwise it lists all partners (optionally filtered by type).
 */
export class SearchBusinessPartnersUseCase {
  constructor(private readonly partnerRepository: IBusinessPartnerRepository) {}

  async execute(params: {
    companyId: string;
    type?: PartnerType;
    query?: string;
  }): Promise<BusinessPartner[]> {
    const query = params.query?.trim();
    if (query && query.length > 0) {
      return this.partnerRepository.search({
        companyId: params.companyId,
        type: params.type,
        query,
      });
    }
    return this.partnerRepository.findManyByCompany(params.companyId, { type: params.type });
  }
}
