import { AppError } from '../../../domain/errors/AppError';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';

/**
 * Asserts that an authenticated user belongs to a company (any role).
 */
export class CompanyAccessGuard {
  constructor(private readonly userOnCompanyRepository: IUserOnCompanyRepository) {}

  async assertMember(userId: string, companyId: string | null | undefined): Promise<void> {
    if (!companyId) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(companyId, userId);
    if (!membership) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }

  async assertMemberOfAny(userId: string, companyIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(companyIds.filter((id) => id.length > 0))];
    if (uniqueIds.length === 0) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
    const memberships = await this.userOnCompanyRepository.findByUserId(userId);
    const allowed = new Set(memberships.map((membership) => membership.companyId));
    const hasAccess = uniqueIds.some((companyId) => allowed.has(companyId));
    if (!hasAccess) {
      throw AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS');
    }
  }
}
