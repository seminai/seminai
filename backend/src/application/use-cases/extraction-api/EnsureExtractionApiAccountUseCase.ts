import type { ExtractionApiAccountSummary } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiAccountRepository } from '../../../domain/repositories/IExtractionApiAccountRepository';
import { getExtractionApiTrialPages } from '../../../infrastructure/services/extraction-api/extraction-api.config';

export class EnsureExtractionApiAccountUseCase {
  constructor(private readonly accountRepository: IExtractionApiAccountRepository) {}

  async execute(userId: string): Promise<ExtractionApiAccountSummary> {
    const existing = await this.accountRepository.findByUserId(userId);
    if (existing) {
      return this.accountRepository.toSummary(existing);
    }
    const created = await this.accountRepository.createForUser(
      userId,
      getExtractionApiTrialPages(),
    );
    return this.accountRepository.toSummary(created);
  }
}
