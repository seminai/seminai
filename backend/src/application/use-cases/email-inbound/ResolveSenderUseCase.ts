import { type SenderResolutionDto } from '../../../domain/dtos/email-inbound.dto';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { type IUserRepository } from '../../../domain/repositories/IUserRepository';

interface ResolveSenderInput {
  readonly fromAddress: string;
}

/**
 * Resolves an inbound email sender to (userId, companyId).
 *
 * Order of checks:
 * 1. `unknown` if no User row matches the sender;
 * 2. `opt_out` if the user has not enabled email ingestion in their Settings;
 * 3. `no_companies` / `single` / `multiple` based on UserOnCompany associations.
 */
export class ResolveSenderUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  async execute({ fromAddress }: ResolveSenderInput): Promise<SenderResolutionDto> {
    const user = await this.userRepository.findByEmail(fromAddress.toLowerCase());
    if (!user) return { kind: 'unknown' };
    const settings = await this.settingsRepository.findByUserId(user.id);
    if (!settings || !settings.isEmailIngestionEnabled()) {
      return { kind: 'opt_out', userId: user.id };
    }
    const companies = await this.companyRepository.findManyByUserId(user.id);
    if (companies.length === 0) return { kind: 'no_companies', userId: user.id };
    if (companies.length === 1) {
      return { kind: 'single', userId: user.id, companyId: companies[0].id };
    }
    return {
      kind: 'multiple',
      userId: user.id,
      candidates: companies.map((company, index) => ({
        index: index + 1,
        companyId: company.id,
        companyName: company.name,
      })),
    };
  }
}
