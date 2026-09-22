import { AppError } from '../../../domain/errors/AppError';
import type { ExtractionApiAccountSummary } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiAccountRepository } from '../../../domain/repositories/IExtractionApiAccountRepository';

export class GetExtractionApiAccountUseCase {
  constructor(private readonly accountRepository: IExtractionApiAccountRepository) {}

  async execute(userId: string): Promise<ExtractionApiAccountSummary> {
    const account = await this.accountRepository.findByUserId(userId);
    if (!account) {
      throw AppError.notFound(
        'Extraction API account not found',
        'EXTRACTION_API_ACCOUNT_NOT_FOUND',
      );
    }
    return this.accountRepository.toSummary(account);
  }
}
