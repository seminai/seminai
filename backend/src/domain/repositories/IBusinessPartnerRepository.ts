import { PartnerType } from '@prisma/client';
import { BusinessPartner } from '../entities/BusinessPartner';
import { PartnerDuplicateQuery } from '../dtos/business-partner.dto';

/** Persistence contract for the unified customer/supplier anagrafica. */
export interface IBusinessPartnerRepository {
  create(partner: BusinessPartner): Promise<BusinessPartner>;
  update(id: string, data: Partial<BusinessPartner>): Promise<BusinessPartner>;
  findById(id: string): Promise<BusinessPartner | null>;
  findManyByCompany(
    companyId: string,
    options?: { type?: PartnerType },
  ): Promise<BusinessPartner[]>;
  /** Returns the first partner matching P.IVA, email or ragione sociale (dedup). */
  findDuplicate(query: PartnerDuplicateQuery): Promise<BusinessPartner | null>;
  /** Free-text search over name / vatNumber / email within a company. */
  search(params: {
    companyId: string;
    type?: PartnerType;
    query: string;
  }): Promise<BusinessPartner[]>;
  /**
   * Customers with follow-ups enabled + an email, never contacted or last
   * contacted before `before` (global, across companies — used by the cron).
   */
  findDueForFollowUp(before: Date): Promise<BusinessPartner[]>;
}
